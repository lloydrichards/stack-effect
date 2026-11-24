import {
  type ClientId,
  type ClientInfo,
  type ClientStatus,
  WebSocketEvent,
} from "@repo/domain/WebSocket";
import { Context, DateTime, Effect, Layer, PubSub, Stream } from "effect";

export class PresenceService extends Context.Service<
  PresenceService,
  {
    readonly addClient: (
      clientId: ClientId,
      info: ClientInfo,
    ) => Effect.Effect<void>;
    readonly removeClient: (clientId: ClientId) => Effect.Effect<void>;
    readonly setStatus: (
      clientId: ClientId,
      status: ClientStatus,
    ) => Effect.Effect<void>;
    readonly getClients: () => ReadonlyArray<ClientInfo>;
    readonly subscribe: Stream.Stream<WebSocketEvent>;
  }
>()("PresenceService") {
  static readonly layer = Layer.effect(
    PresenceService,
    Effect.gen(function* () {
      const clientsMap = new Map<ClientId, ClientInfo>();

      const pubsub = yield* PubSub.sliding<WebSocketEvent>(1000);

      const addClient = Effect.fn("PresenceService.addClient")(function* (
        clientId: ClientId,
        info: ClientInfo,
      ) {
        clientsMap.set(clientId, info);

        yield* PubSub.publish(
          pubsub,
          WebSocketEvent.cases.user_joined.make({ client: info }),
        );
      });

      const removeClient = Effect.fn("PresenceService.removeClient")(function* (
        clientId: ClientId,
      ) {
        const client = clientsMap.get(clientId);

        if (client) {
          const disconnectedAt = yield* DateTime.now;

          clientsMap.delete(clientId);

          yield* PubSub.publish(
            pubsub,
            WebSocketEvent.cases.user_left.make({ clientId, disconnectedAt }),
          );
        }
      });

      const setStatus = Effect.fn("PresenceService.setStatus")(function* (
        clientId: ClientId,
        status: ClientStatus,
      ) {
        const client = clientsMap.get(clientId);

        if (client) {
          const changedAt = yield* DateTime.now;
          clientsMap.set(clientId, { ...client, status });

          yield* PubSub.publish(
            pubsub,
            WebSocketEvent.cases.status_changed.make({
              clientId,
              status,
              changedAt,
            }),
          );
        }
      });

      const getClients = () => Array.from(clientsMap.values());

      const subscribe = Stream.fromPubSub(pubsub);

      return PresenceService.of({
        addClient,
        removeClient,
        setStatus,
        getClients,
        subscribe,
      });
    }),
  );
}
