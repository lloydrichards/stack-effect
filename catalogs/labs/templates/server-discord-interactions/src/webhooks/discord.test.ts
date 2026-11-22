// @effect-diagnostics nodeBuiltinImport:off The fixture signs independently of the adapter.
import { generateKeyPairSync, sign } from "node:crypto";
import { ConfigProvider, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { expect, it } from "vitest";
import { DiscordInteractions } from "./discord";

it("answers signed PING and rejects tampered or malformed interactions", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key = publicKey
    .export({ type: "spki", format: "der" })
    .subarray(-32)
    .toString("hex");
  const app = HttpRouter.toWebHandler(
    DiscordInteractions.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ DISCORD_PUBLIC_KEY: key }),
        ),
      ),
    ),
    { disableLogger: true },
  );
  const timestamp = "1700000000";
  const send = (body: string, signedBody = body, sentTimestamp = timestamp) =>
    app.handler(
      new Request("http://localhost/webhooks/discord", {
        method: "POST",
        body,
        headers: {
          "x-signature-timestamp": sentTimestamp,
          "x-signature-ed25519": sign(
            null,
            Buffer.from(timestamp + signedBody),
            privateKey,
          ).toString("hex"),
        },
      }),
    );
  try {
    const ping = '{ "type": 1 }';
    const valid = await send(ping);
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ type: 1 });
    expect((await send('{"type":1}', ping)).status).toBe(401);
    expect((await send(ping, ping, "1700000001")).status).toBe(401);
    expect((await send('{"type":2}')).status).toBe(400);
    expect((await send("{")).status).toBe(400);
  } finally {
    await app.dispose();
  }
});
