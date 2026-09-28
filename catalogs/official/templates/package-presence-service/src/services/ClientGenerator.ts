import { ClientId } from "@repo/domain/WebSocket";
import { Context, Crypto, Effect, Layer } from "effect";

export class ClientGenerator extends Context.Service<ClientGenerator>()(
  "ClientGenerator",
  {
    make: Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      return {
        generateClientId: Effect.fn("generateClientId")(function* () {
          const uuid = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
          return ClientId.make(uuid);
        }),
      };
    }),
  },
) {
  static layer = Layer.effect(ClientGenerator)(ClientGenerator.make);
}
