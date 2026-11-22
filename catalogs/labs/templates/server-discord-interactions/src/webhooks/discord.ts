// @effect-diagnostics unstableApiUsage:off This adapter uses Effect Signature and HTTP responses.
import { DiscordPing, DiscordPong } from "@repo/domain/DiscordInteraction";
import { ByteSize, Config, Effect, Layer, Option, Schema } from "effect";
import { SecureRandom, Signature } from "effect/crypto";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";

const hex = Schema.decodeUnknownEffect(Schema.Uint8ArrayFromHex);
const decodePing = Schema.decodeEffect(Schema.fromJsonString(DiscordPing));

const DiscordConfig = Config.all({
  publicKey: Config.String("DISCORD_PUBLIC_KEY"),
});

export const DiscordInteractions = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const signature = yield* Signature.Signature;
    const { publicKey } = yield* DiscordConfig;

    const key = yield* hex(publicKey).pipe(
      Effect.flatMap((bytes) => Signature.publicKey(Signature.ed25519, bytes)),
    );

    yield* router.add("POST", "/webhooks/discord", (request) =>
      Effect.gen(function* () {
        const timestamp = request.headers["x-signature-timestamp"];
        const signed = yield* hex(request.headers["x-signature-ed25519"]).pipe(
          Effect.option,
        );

        if (
          timestamp === undefined ||
          !/^\d+$/.test(timestamp) ||
          Option.isNone(signed)
        ) {
          return HttpServerResponse.empty({ status: 401 });
        }

        // Bound the raw read before authenticating the delivery.
        const raw = yield* request.arrayBuffer.pipe(
          Effect.provideService(
            HttpServerRequest.MaxBodySize,
            ByteSize.kibibytes(4),
          ),
        );
        const prefix = new TextEncoder().encode(timestamp);
        const data = new Uint8Array(prefix.length + raw.byteLength);
        data.set(prefix);
        data.set(new Uint8Array(raw), prefix.length);

        if (!(yield* signature.verify(key, signed.value, data))) {
          return HttpServerResponse.empty({ status: 401 });
        }

        const ping = yield* decodePing(new TextDecoder().decode(raw)).pipe(
          Effect.option,
        );
        if (Option.isNone(ping)) {
          return HttpServerResponse.empty({ status: 400 });
        }

        return yield* HttpServerResponse.json(DiscordPong.make({ type: 1 }));
      }),
    );
  }),
).pipe(
  Layer.provide(
    Signature.layerWebCrypto.pipe(Layer.provide(SecureRandom.layerWebCrypto)),
  ),
);
