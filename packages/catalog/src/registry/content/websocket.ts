// Domain WebSocket schema
export const domainWebSocketContents = `import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export const ClientId = Schema.String.pipe(Schema.brand("ClientId"));

export const ClientStatus = Schema.Literals(["online", "away", "busy"]);
export type ClientStatus = Schema.Schema.Type<typeof ClientStatus>;

export const ClientInfo = Schema.Struct({
  clientId: ClientId,
  status: ClientStatus,
  connectedAt: Schema.DateTimeUtcFromMillis,
});
export type ClientInfo = Schema.Schema.Type<typeof ClientInfo>;

export const WebSocketEvent = Schema.Union([
  // Initial connection acknowledgment with assigned ClientId
  Schema.TaggedStruct("connected", {
    clientId: ClientId,
    connectedAt: Schema.DateTimeUtcFromMillis,
  }),
  // Broadcast when a user joins
  Schema.TaggedStruct("user_joined", {
    client: ClientInfo,
  }),
  // Broadcast when a user's status changes
  Schema.TaggedStruct("status_changed", {
    clientId: ClientId,
    status: ClientStatus,
    changedAt: Schema.DateTimeUtcFromMillis,
  }),
  // Broadcast when a user disconnects
  Schema.TaggedStruct("user_left", {
    clientId: ClientId,
    disconnectedAt: Schema.DateTimeUtcFromMillis,
  }),
]);
export type WebSocketEvent = Schema.Schema.Type<typeof WebSocketEvent>;

export class WebSocketRpc extends RpcGroup.make(
  // Subscribe to presence events - returns a stream of events
  Rpc.make("subscribe", {
    success: WebSocketEvent,
    stream: true, // This makes it a streaming RPC over WebSocket
  }),

  // Set your presence status (requires clientId from subscribe)
  Rpc.make("setStatus", {
    payload: {
      clientId: ClientId,
      status: ClientStatus,
    },
    success: Schema.Struct({
      success: Schema.Boolean,
    }),
  }),

  // Get current list of connected clients
  Rpc.make("getPresence", {
    success: Schema.Struct({
      clients: Schema.Array(ClientInfo),
    }),
  }),
) {}
`;

// Server Presence RPC handler
export const serverPresenceContents = `import { BunCrypto } from "@effect/platform-bun";
import {
  type ClientInfo,
  type WebSocketEvent,
  WebSocketRpc,
} from "@repo/domain/WebSocket";
import { ClientGenerator, PresenceService } from "@repo/presence";
import { DateTime, Effect, Layer, Queue, Stream } from "effect";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

const PresenceRpcHandlers = WebSocketRpc.toLayer(
  Effect.gen(function* () {
    const presence = yield* PresenceService;
    const gen = yield* ClientGenerator;
    yield* Effect.logInfo("Starting Presence RPC Live Implementation");

    return WebSocketRpc.of({
      subscribe: Effect.fn(function* () {
        yield* Effect.logDebug("New presence subscription");

        const clientId = yield* gen.generateClientId();
        const connectedAt = yield* DateTime.now;
        const clientInfo: ClientInfo = {
          clientId,
          status: "online",
          connectedAt,
        };

        const queue = yield* Queue.unbounded<WebSocketEvent>();

        // Fork the stream consumer to handle incoming PubSub events
        yield* Effect.forkScoped(
          presence.subscribe.pipe(
            Stream.tap((event) =>
              Effect.gen(function* () {
                // Filter out our own user_joined event since we send "connected" instead
                if (
                  event._tag === "user_joined" &&
                  event.client.clientId === clientId
                ) {
                  return;
                }
                yield* Queue.offer(queue, event);
              }),
            ),
            Stream.runDrain,
            Effect.ensuring(
              Effect.gen(function* () {
                yield* presence.removeClient(clientId);
                yield* Queue.shutdown(queue);
                yield* Effect.logDebug(
                  \`Presence subscription ended for \${clientId}\`,
                );
              }),
            ),
          ),
        );

        // Get existing clients BEFORE adding ourselves
        const existingClients = presence.getClients();

        // Now add ourselves - this publishes user_joined to PubSub for other clients
        yield* presence.addClient(clientId, clientInfo);

        // Send our own connected event (not user_joined since we're the one connecting)
        yield* Queue.offer(queue, {
          _tag: "connected",
          clientId,
          connectedAt,
        });

        // Send existing clients as user_joined events so we know who's already here
        for (const client of existingClients) {
          yield* Queue.offer(queue, {
            _tag: "user_joined",
            client,
          });
        }

        return queue;
      }),

      setStatus: Effect.fn(function* (payload) {
        yield* Effect.logDebug(
          \`Setting status for \${payload.clientId} to \${payload.status}\`,
        );
        yield* presence.setStatus(payload.clientId, payload.status);
        return { success: true };
      }),

      getPresence: Effect.fn(function* () {
        const clients = presence.getClients();
        yield* Effect.logDebug(\`Returning \${clients.length} clients\`);
        return { clients: [...clients] };
      }),
    });
  }),
).pipe(
  Layer.provide(PresenceService.layer),
  Layer.provide(ClientGenerator.layer),
  Layer.provide(BunCrypto.layer),
);

export const PresenceRpcLive = RpcServer.layerHttp({
  group: WebSocketRpc,
  path: "/ws",
}).pipe(
  Layer.provide(PresenceRpcHandlers),
  Layer.provide(RpcSerialization.layerNdjson),
);
`;
