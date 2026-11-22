import * as SecureRandom from "effect/crypto/SecureRandom";
import { ClientId } from "@repo/domain/WebSocket";
import { Context, Effect, Layer } from "effect";

export class ClientGenerator extends Context.Service<ClientGenerator>()(
  "ClientGenerator",
  {
    make: Effect.gen(function* () {
      const crypto = yield* SecureRandom.SecureRandom;
      return {
        generateClientId: Effect.fn("generateClientId")(function* () {
          const uuid = yield* crypto.uuidV4().pipe(Effect.orDie);
          return ClientId.make(uuid);
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(ClientGenerator)(ClientGenerator.make);
}
