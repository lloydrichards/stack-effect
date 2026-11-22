// @effect-diagnostics nodeBuiltinImport:off Use independent signing primitives to generate fixture deliveries.
import { generateKeyPairSync, sign } from "node:crypto";
import { ConfigProvider, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { DiscordInteractions } from "../webhooks/discord";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyHex = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");

const app = HttpRouter.toWebHandler(
  DiscordInteractions.pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ DISCORD_PUBLIC_KEY: publicKeyHex }))),
  ),
  { disableLogger: true },
);

const ping = '{"type":1}';
const timestamp = String(Math.floor(Date.now() / 1000));

async function deliver(label: string, body: string, signedBody = body) {
  const signature = sign(null, Buffer.from(timestamp + signedBody), privateKey).toString("hex");

  const response = await app.handler(new Request("http://localhost/webhooks/discord", {
    method: "POST",
    body,
    headers: {
      "x-signature-timestamp": timestamp,
      "x-signature-ed25519": signature,
    },
  }));

  const result = await response.text();
  console.log(`${label}: HTTP ${response.status}${result ? ` ${result}` : ""}`);
}

try {
  await deliver("Signed PING", ping);
  await deliver("Tampered PING", ping + " ", ping);
  await deliver("Unsupported interaction", '{"type":2}');
  await deliver("Malformed JSON", "{");
  await deliver("Oversized PING", ping + " ".repeat(4096));
} finally {
  await app.dispose();
}
