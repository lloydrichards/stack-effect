import { ClientId } from "@repo/domain/WebSocket";
import { Context, Effect, Layer, Random } from "effect";

export class ClientGenerator extends Context.Service<ClientGenerator>()(
  "ClientGenerator",
  {
    make: Effect.succeed({
      generateClientId: Effect.fn("generateClientId")(function* () {
        const uuid = yield* Random.nextUUIDv4;
        return ClientId.make(uuid);
      }),
    }),
  },
) {
  static layer = Layer.effect(ClientGenerator)(ClientGenerator.make);
}
