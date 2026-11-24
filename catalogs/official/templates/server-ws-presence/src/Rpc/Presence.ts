{{#if runtime=bun}}import { BunCrypto as PlatformCrypto } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import { NodeCrypto as PlatformCrypto } from "@effect/platform-node";{{/if}}{{#if runtime=deno}}import { DenoCrypto as PlatformCrypto } from "@effect/platform-deno";{{/if}}
import {
  ClientInfo,
  WebSocketEvent,
  WebSocketRpc,
} from "@repo/domain/WebSocket";
import { ClientGenerator } from "@repo/presence/ClientGenerator";
import { PresenceService } from "@repo/presence/PresenceService";
import { DateTime, Effect, Layer, Queue, Stream } from "effect";
import { RpcSerialization, RpcServer } from "effect/rpc";

const PresenceRpcHandlers = WebSocketRpc.toLayer(
  Effect.gen(function* () {
    const presence = yield* PresenceService;
    const gen = yield* ClientGenerator;

    return WebSocketRpc.of({
      subscribe: Effect.fnUntraced(function* () {
        const clientId = yield* gen.generateClientId;
        const connectedAt = yield* DateTime.now;
        const queue = yield* Queue.unbounded<WebSocketEvent>();

        yield* Effect.forkScoped(
          presence.subscribe.pipe(
            // The subscriber gets "connected" instead of its own user_joined.
            Stream.filter(
              (event) =>
                event._tag !== "user_joined" ||
                event.client.clientId !== clientId,
            ),
            Stream.runForEach((event) => Queue.offer(queue, event)),
            Effect.ensuring(
              Effect.andThen(
                presence.removeClient(clientId),
                Queue.shutdown(queue),
              ),
            ),
          ),
        );

        // Read the existing clients before addClient lists this one.
        const existingClients = presence.getClients();
        yield* presence.addClient(
          clientId,
          ClientInfo.make({ clientId, status: "online", connectedAt }),
        );

        yield* Queue.offerAll(queue, [
          WebSocketEvent.cases.connected.make({ clientId, connectedAt }),
          ...existingClients.map((client) =>
            WebSocketEvent.cases.user_joined.make({ client }),
          ),
        ]);

        return queue;
      }),

      setStatus: ({ clientId, status }) => presence.setStatus(clientId, status),

      getPresence: () => Effect.succeed({ clients: presence.getClients() }),
    });
  }),
).pipe(
  Layer.provide(PresenceService.layer),
  Layer.provide(ClientGenerator.layer),
  Layer.provide(PlatformCrypto.layer),
);

export const PresenceRpcRoutes = RpcServer.layerHttp({
  group: WebSocketRpc,
  path: "/ws",
}).pipe(
  Layer.provide(PresenceRpcHandlers),
  Layer.provide(RpcSerialization.layerNdjson),
);
