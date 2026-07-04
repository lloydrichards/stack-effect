export const presenceIndexContents = `export * from "./services/ClientGenerator";
export * from "./services/PresenceService";
`;

export const presenceClientGeneratorContents = `import { ClientId } from "@repo/domain/WebSocket";
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
`;

export const presenceServiceContents = `import type {
  ClientId,
  ClientInfo,
  ClientStatus,
  WebSocketEvent,
} from "@repo/domain/WebSocket";
import { Context, DateTime, Effect, Layer, PubSub, Stream } from "effect";

export type PresenceEventType = typeof WebSocketEvent.Type;

export class PresenceService extends Context.Service<PresenceService>()(
  "PresenceService",
  {
    make: Effect.gen(function* () {
      yield* Effect.logInfo("Initializing PresenceService");

      const clientsMap = new Map<typeof ClientId.Type, ClientInfo>();

      const pubsub = yield* PubSub.sliding<PresenceEventType>(1000);

      const addClient = Effect.fn("PresenceService.addClient")(function* (
        clientId: typeof ClientId.Type,
        info: ClientInfo,
      ) {
        clientsMap.set(clientId, info);

        yield* PubSub.publish(pubsub, {
          _tag: "user_joined",
          client: info,
        });

        yield* Effect.logDebug(\`Client added: \${clientId}\`);
      });

      const removeClient = Effect.fn("PresenceService.removeClient")(function* (
        clientId: typeof ClientId.Type,
      ) {
        const client = clientsMap.get(clientId);

        if (client) {
          const disconnectedAt = yield* DateTime.now;

          clientsMap.delete(clientId);

          yield* PubSub.publish(pubsub, {
            _tag: "user_left",
            clientId,
            disconnectedAt,
          });

          yield* Effect.logDebug(\`Client removed: \${clientId}\`);
        }
      });

      const setStatus = Effect.fn("PresenceService.setStatus")(function* (
        clientId: typeof ClientId.Type,
        status: ClientStatus,
      ) {
        const client = clientsMap.get(clientId);

        if (client) {
          const changedAt = yield* DateTime.now;
          const updatedClient: ClientInfo = {
            ...client,
            status,
          };

          clientsMap.set(clientId, updatedClient);

          yield* PubSub.publish(pubsub, {
            _tag: "status_changed",
            clientId,
            status,
            changedAt,
          });

          yield* Effect.logDebug(
            \`Client \${clientId} status changed to \${status}\`,
          );
        }
      });

      const getClients = () => Array.from(clientsMap.values());

      const subscribe = Stream.fromPubSub(pubsub);

      return {
        pubsub,
        addClient,
        removeClient,
        setStatus,
        getClients,
        subscribe,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(PresenceService)(PresenceService.make);
}

export const PresenceServiceLive = PresenceService.layer;
`;
