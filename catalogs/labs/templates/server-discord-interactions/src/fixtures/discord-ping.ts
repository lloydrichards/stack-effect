// @effect-diagnostics nodeBuiltinImport:off Use independent signing primitives to generate fixture deliveries.
import { generateKeyPairSync, sign } from "node:crypto";
import { Clock, ConfigProvider, Console, Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { DiscordInteractions } from "../webhooks/discord";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyHex = publicKey.export({ format: "der", type: "spki" }).subarray(
  -32,
).toString("hex");

const app = HttpRouter.toWebHandler(
  DiscordInteractions.pipe(
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({ DISCORD_PUBLIC_KEY: publicKeyHex }),
      ),
    ),
  ),
  { disableLogger: true },
);

const ping = '{"type":1}';

const deliver = Effect.fnUntraced(
  function* (label: string, body: string, signedBody = body) {
    const now = yield* Clock.currentTimeMillis;
    const timestamp = String(Math.floor(now / 1000));
    const signature = sign(
      null,
      Buffer.from(timestamp + signedBody),
      privateKey,
    ).toString("hex");

    const request = new Request("http://localhost/webhooks/discord", {
      method: "POST",
      body,
      headers: {
        "x-signature-timestamp": timestamp,
        "x-signature-ed25519": signature,
      },
    });
    const response = yield* Effect.promise(() => app.handler(request));

    const result = yield* Effect.promise(() => response.text());
    yield* Console.log(
      `${label}: HTTP ${response.status}${result ? ` ${result}` : ""}`,
    );
  },
);

await Effect.runPromise(
  Effect.gen(function* () {
    yield* deliver("Signed PING", ping);
    yield* deliver("Tampered PING", ping + " ", ping);
    yield* deliver("Unsupported interaction", '{"type":2}');
    yield* deliver("Malformed JSON", "{");
    yield* deliver("Oversized PING", ping + " ".repeat(4096));
  }).pipe(Effect.ensuring(Effect.promise(() => app.dispose()))),
);
