export const clientWebSocketClientContents = `import { BrowserSocket } from "@effect/platform-browser";
import type { WebSocketEvent } from "@repo/domain/WebSocket";
import { WebSocketRpc } from "@repo/domain/WebSocket";
import { type Cause, Effect, Layer, Stream } from "effect";
import { type Atom, AtomRpc } from "effect/unstable/reactivity";
import {
  RpcClient,
  type RpcClientError,
  RpcSerialization,
} from "effect/unstable/rpc";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:9000/ws";

export class WebSocketClient extends AtomRpc.Service<WebSocketClient>()(
  "WebSocketClient",
  {
    group: WebSocketRpc,
    protocol: RpcClient.layerProtocolSocket({
      retryTransientErrors: true,
    }).pipe(
      Layer.provide(BrowserSocket.layerWebSocket(WS_URL)),
      Layer.provide(RpcSerialization.layerNdjson),
    ),
  },
) {}

export const presenceSubscriptionAtom: Atom.AtomResultFn<
  void,
  readonly WebSocketEvent[],
  RpcClientError.RpcClientError | Cause.NoSuchElementError
> = WebSocketClient.runtime.fn(() =>
  Effect.gen(function* () {
    yield* Effect.logDebug("Starting presence subscription stream");
    const client = yield* WebSocketClient;
    // biome-ignore lint/suspicious/noConfusingVoidType: RPC with no payload requires void argument
    return client("subscribe", undefined as void);
  }).pipe(
    Effect.map((stream) =>
      stream.pipe(
        // NOTE: Cap event accumulation at 100 to prevent memory growth in long sessions.
        Stream.scan<WebSocketEvent[], WebSocketEvent>([], (acc, event) => {
          const updated = [...acc, event];
          return updated.length > 100 ? updated.slice(-100) : updated;
        }),
      ),
    ),
    Stream.unwrap,
  ),
);
`;

export const clientPresencePanelContents = `import { useAtom, useAtomSet } from "@effect/atom-react";
import type {
  ClientId,
  ClientInfo,
  ClientStatus,
  WebSocketEvent,
} from "@repo/domain/WebSocket";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  presenceSubscriptionAtom,
  WebSocketClient,
} from "@/lib/web-socket-client";

const buildClientListFromEvents = (
  events: readonly WebSocketEvent[],
): {
  clients: Map<typeof ClientId.Type, ClientInfo>;
  myClientId: typeof ClientId.Type | null;
} => {
  const clients = new Map<typeof ClientId.Type, ClientInfo>();
  let myClientId: typeof ClientId.Type | null = null;

  for (const event of events) {
    switch (event._tag) {
      case "connected":
        myClientId = event.clientId;
        clients.set(event.clientId, {
          clientId: event.clientId,
          status: "online",
          connectedAt: event.connectedAt,
        });
        break;

      case "user_joined":
        clients.set(event.client.clientId, event.client);
        break;

      case "status_changed": {
        const existing = clients.get(event.clientId);
        if (existing) {
          clients.set(event.clientId, {
            ...existing,
            status: event.status,
          });
        }
        break;
      }

      case "user_left":
        clients.delete(event.clientId);
        break;
    }
  }

  return { clients, myClientId };
};

export function PresencePanel({ className }: { className?: string }) {
  const [eventsResult, startSubscription] = useAtom(presenceSubscriptionAtom);
  const setStatus = useAtomSet(WebSocketClient.mutation("setStatus"));

  useEffect(() => {
    startSubscription();
  }, [startSubscription]);

  const events = AsyncResult.getOrElse(
    eventsResult,
    () => [] as readonly WebSocketEvent[],
  );

  const { clients: clientMap, myClientId } = useMemo(
    () => buildClientListFromEvents(events),
    [events],
  );

  const clients = useMemo(() => Array.from(clientMap.values()), [clientMap]);

  const handleSetStatus = (status: ClientStatus) => {
    if (!myClientId) {
      console.error("Cannot set status: not connected yet");
      return;
    }
    setStatus({
      payload: { clientId: myClientId, status },
    });
  };

  const getStatusColor = (status: ClientStatus) => {
    switch (status) {
      case "online":
        return "bg-primary";
      case "away":
        return "bg-secondary";
      case "busy":
        return "bg-destructive";
      default:
        return "bg-muted-foreground";
    }
  };

  const isConnected = AsyncResult.isSuccess(eventsResult);
  const isConnecting = AsyncResult.isInitial(eventsResult);

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>WebSocket Presence (RPC)</CardTitle>
            <p className="text-xs text-muted-foreground">Realtime status updates over RPC.</p>
          </div>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem]",
              isConnected
                ? "border-primary/30 bg-primary/10 text-primary"
                : isConnecting
                  ? "border-secondary/50 bg-secondary text-secondary-foreground"
                  : "border-destructive/40 bg-destructive/10 text-destructive",
            )}
          >
            {isConnected && myClientId
              ? "connected"
              : isConnecting
                ? "connecting"
                : "disconnected"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Button
            onClick={() => handleSetStatus("online")}
            className="flex-1"
            disabled={!isConnected || !myClientId}
          >
            Online
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSetStatus("away")}
            className="flex-1"
            disabled={!isConnected || !myClientId}
          >
            Away
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSetStatus("busy")}
            className="flex-1"
            disabled={!isConnected || !myClientId}
          >
            Busy
          </Button>
        </div>

        <div className="rounded-none border border-border bg-muted/50 p-3">
          <h4 className="mb-2 font-medium text-foreground text-xs uppercase tracking-[0.2em]">
            Connected Clients ({clients.length})
          </h4>
          {clients.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No clients connected
            </p>
          ) : (
            <ul className="space-y-1">
              {clients.map((client: ClientInfo) => (
                <li
                  key={client.clientId}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      getStatusColor(client.status),
                    )}
                  />
                  <span className="font-mono text-muted-foreground">
                    {client.clientId.slice(0, 8)}...
                  </span>
                  <span className="text-muted-foreground">
                    ({client.status})
                  </span>
                  {client.clientId === myClientId && (
                    <span className="text-primary text-[0.6rem] uppercase tracking-[0.2em]">
                      you
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
`;
