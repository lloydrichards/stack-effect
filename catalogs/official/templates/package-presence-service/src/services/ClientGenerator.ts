import * as SecureRandom from "effect/crypto/SecureRandom";
import { ClientId } from "@repo/domain/WebSocket";
import { Context, Effect, Layer } from "effect";

export class ClientGenerator extends Context.Service<
  ClientGenerator,
  { readonly generateClientId: Effect.Effect<ClientId> }
>()("ClientGenerator") {
  static readonly layer = Layer.effect(
    ClientGenerator,
    Effect.gen(function* () {
      const crypto = yield* SecureRandom.SecureRandom;

      return ClientGenerator.of({
        generateClientId: Effect.gen(function* () {
          const uuid = yield* crypto.uuidV4().pipe(Effect.orDie);

          return ClientId.make(uuid);
        }).pipe(Effect.withSpan("ClientGenerator.generateClientId")),
      });
    }),
  );
}
