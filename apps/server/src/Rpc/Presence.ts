import {
  type ClientInfo,
  type WebSocketEvent,
  WebSocketRpc,
} from "@repo/domain/WebSocket";
import { ClientGenerator, PresenceService } from "@repo/presence";
import { DateTime, Effect, Layer, Queue, Stream } from "effect";

export const PresenceRpcLive = WebSocketRpc.toLayer(
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
                  `Presence subscription ended for ${clientId}`,
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
          `Setting status for ${payload.clientId} to ${payload.status}`,
        );
        yield* presence.setStatus(payload.clientId, payload.status);
        return { success: true };
      }),

      getPresence: Effect.fn(function* () {
        const clients = presence.getClients();
        yield* Effect.logDebug(`Returning ${clients.length} clients`);
        return { clients: [...clients] };
      }),
    });
  }),
).pipe(
  Layer.provide(PresenceService.layer),
  Layer.provide(ClientGenerator.layer),
);
