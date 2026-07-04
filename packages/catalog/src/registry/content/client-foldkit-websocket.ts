export const foldkitWsClientContents = `import { BrowserSocket } from "@effect/platform-browser";
import { WebSocketRpc } from "@repo/domain/WebSocket";
import { Context, Layer } from "effect";
import {
  RpcClient as EffectRpcClient,
  RpcClientError,
  RpcSerialization,
} from "effect/unstable/rpc";

const WS_URL = "ws://localhost:9000/ws";

type WsRpcClient = EffectRpcClient.FromGroup<
  typeof WebSocketRpc,
  RpcClientError.RpcClientError
>;

export class WsClient extends Context.Service<WsClient, WsRpcClient>()(
  "WsClient",
) {}

const WsProtocolLive = EffectRpcClient.layerProtocolSocket({
  retryTransientErrors: true,
}).pipe(
  Layer.provide(BrowserSocket.layerWebSocket(WS_URL)),
  Layer.provide(RpcSerialization.layerNdjson),
);

export const WsClientLive = Layer.effect(
  WsClient,
  EffectRpcClient.make(WebSocketRpc),
).pipe(Layer.provide(WsProtocolLive));
`;

export const foldkitPresenceFeatureContents = `import { ClientId, ClientStatus, WebSocketEvent } from "@repo/domain/WebSocket";
import {
  Array as Arr,
  DateTime,
  Effect,
  Match,
  Option,
  Schema,
  Stream,
} from "effect";
import { Command, Subscription } from "foldkit";
import type { Html } from "foldkit/html";
import { html } from "foldkit/html";
import { m } from "foldkit/message";
import { evo } from "foldkit/struct";
import { WsClient, WsClientLive } from "../services/ws-client";

const PresenceClient = Schema.Struct({
  clientId: Schema.String,
  status: Schema.String,
  connectedAt: Schema.Number,
});

export const Model = Schema.Struct({
  presenceEnabled: Schema.Boolean,
  presenceClients: Schema.Array(PresenceClient),
  myClientId: Schema.Option(ClientId),
  myStatus: Schema.String,
});
export type Model = typeof Model.Type;

export const ClickedConnectPresence = m("ClickedConnectPresence");
export const ClickedDisconnectPresence = m("ClickedDisconnectPresence");
export const ReceivedPresenceEvent = m("ReceivedPresenceEvent", {
  event: WebSocketEvent,
});
export const FailedPresenceStream = m("FailedPresenceStream", {
  error: Schema.String,
});
export const ClickedSetStatus = m("ClickedSetStatus", {
  status: ClientStatus,
});
export const SucceededSetStatus = m("SucceededSetStatus");
export const FailedSetStatus = m("FailedSetStatus", { error: Schema.String });

export const Message = Schema.Union([
  ClickedConnectPresence,
  ClickedDisconnectPresence,
  ReceivedPresenceEvent,
  FailedPresenceStream,
  ClickedSetStatus,
  SucceededSetStatus,
  FailedSetStatus,
]);
export type Message = typeof Message.Type;

export const GotMessage = m("GotPresenceMessage", { message: Message });

export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [
  {
    presenceEnabled: false,
    presenceClients: [],
    myClientId: Option.none(),
    myStatus: "online",
  },
  [],
];

const applyPresenceEvent = (
  model: Model,
  event: typeof WebSocketEvent.Type,
): Model =>
  Match.valueTags(event, {
    connected: ({ clientId, connectedAt }) =>
      evo(model, {
        myClientId: () => Option.some(clientId),
        myStatus: () => "online",
        presenceClients: (clients) => [
          ...clients,
          {
            clientId,
            status: "online",
            connectedAt: DateTime.toEpochMillis(connectedAt),
          },
        ],
      }),
    user_joined: ({ client }) =>
      evo(model, {
        presenceClients: (clients) => [
          ...clients.filter((c) => c.clientId !== client.clientId),
          {
            clientId: client.clientId,
            status: client.status,
            connectedAt: DateTime.toEpochMillis(client.connectedAt),
          },
        ],
      }),
    status_changed: ({ clientId, status }) =>
      evo(model, {
        presenceClients: (clients) =>
          clients.map((c) => (c.clientId === clientId ? { ...c, status } : c)),
        myStatus: () =>
          Option.match(model.myClientId, {
            onNone: () => model.myStatus,
            onSome: (myId) => (myId === clientId ? status : model.myStatus),
          }),
      }),
    user_left: ({ clientId }) =>
      evo(model, {
        presenceClients: (clients) =>
          clients.filter((c) => c.clientId !== clientId),
      }),
  });

export const update = (model: Model, message: Message) => {
  return Match.valueTags(message, {
    ClickedConnectPresence: () =>
      [evo(model, { presenceEnabled: () => true }), []] as const,
    ClickedDisconnectPresence: () =>
      [
        evo(model, {
          presenceEnabled: () => false,
          presenceClients: () => [],
          myClientId: () => Option.none(),
          myStatus: () => "online",
        }),
        [],
      ] as const,
    ClickedSetStatus: ({ status }) =>
      [
        model,
        Option.match(model.myClientId, {
          onNone: () => [],
          onSome: (clientId) => [SetStatus({ clientId, status })],
        }),
      ] as const,
    ReceivedPresenceEvent: ({ event }) =>
      [applyPresenceEvent(model, event), []] as const,
    FailedPresenceStream: () =>
      [
        evo(model, {
          presenceEnabled: () => false,
          presenceClients: () => [],
          myClientId: () => Option.none(),
        }),
        [],
      ] as const,
    SucceededSetStatus: () => [model, []] as const,
    FailedSetStatus: () => [model, []] as const,
  });
};

export const SetStatus = Command.define(
  "SetStatus",
  { clientId: ClientId, status: ClientStatus },
  SucceededSetStatus,
  FailedSetStatus,
)(({ clientId, status }) =>
  Effect.gen(function* () {
    const client = yield* WsClient;
    yield* client.setStatus({ clientId, status });
    return SucceededSetStatus();
  }).pipe(
    Effect.catch(() =>
      Effect.succeed(FailedSetStatus({ error: "Failed to set status" })),
    ),
    Effect.provide(WsClientLive),
  ),
);

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  presenceStream: entry(
    { isEnabled: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isEnabled: model.presenceEnabled }),
      dependenciesToStream: ({ isEnabled }) =>
        isEnabled
          ? Effect.gen(function* () {
              const client = yield* WsClient;
              return client.subscribe().pipe(
                Stream.map((event) => ReceivedPresenceEvent({ event })),
                Stream.orDie,
              );
            }).pipe(Stream.unwrap, Stream.provide(WsClientLive))
          : Stream.empty,
    },
  ),
}));

export const view = <ParentMessage>(
  model: Model,
  toParentMessage: (message: Message) => ParentMessage,
): Html => {
  const h = html<ParentMessage>();
  const isConnected = model.presenceEnabled;

  return h.div(
    [
      h.Class(
        "rounded-lg border bg-card text-card-foreground shadow-sm h-full",
      ),
    ],
    [
      h.div(
        [h.Class("flex flex-col space-y-1.5 p-6 border-b border-border")],
        [
          h.div(
            [h.Class("flex items-center justify-between gap-2")],
            [
              h.div(
                [],
                [
                  h.h3(
                    [h.Class("font-semibold leading-none tracking-tight")],
                    ["WebSocket Presence (RPC)"],
                  ),
                  h.p(
                    [h.Class("text-sm text-muted-foreground")],
                    ["Realtime status updates over RPC."],
                  ),
                ],
              ),
              h.span(
                [
                  h.Class(
                    \`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors \${
                      isConnected
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-secondary/50 bg-secondary text-secondary-foreground"
                    }\`,
                  ),
                ],
                [isConnected ? "connected" : "disconnected"],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class("p-6 flex flex-col gap-4")],
        [
          h.div(
            [h.Class("flex gap-2")],
            [
              statusButton(h, toParentMessage, "Online", "online", isConnected),
              statusButton(h, toParentMessage, "Away", "away", isConnected),
              statusButton(h, toParentMessage, "Busy", "busy", isConnected),
            ],
          ),
          isConnected
            ? clientListView(h, model)
            : h.button(
                [
                  h.Class(
                    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 w-full",
                  ),
                  h.OnClick(toParentMessage(ClickedConnectPresence())),
                ],
                ["Connect"],
              ),
        ],
      ),
    ],
  );
};

const statusButton = <ParentMessage>(
  h: ReturnType<typeof html<ParentMessage>>,
  toParentMessage: (message: Message) => ParentMessage,
  label: string,
  status: typeof ClientStatus.Type,
  enabled: boolean,
): Html =>
  h.button(
    [
      h.Class(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-11 px-8 flex-1",
      ),
      h.OnClick(toParentMessage(ClickedSetStatus({ status }))),
      ...(!enabled ? [h.Disabled(true)] : []),
    ],
    [label],
  );

const clientListView = <ParentMessage>(
  h: ReturnType<typeof html<ParentMessage>>,
  model: Model,
): Html =>
  h.div(
    [h.Class("rounded-none border border-border bg-muted/50 p-3")],
    [
      h.h4(
        [
          h.Class(
            "mb-2 font-medium text-foreground text-xs uppercase tracking-[0.2em]",
          ),
        ],
        [\`Connected Clients (\${model.presenceClients.length})\`],
      ),
      Arr.match(model.presenceClients, {
        onEmpty: () =>
          h.p(
            [h.Class("text-muted-foreground text-xs")],
            ["No clients connected"],
          ),
        onNonEmpty: (clients) =>
          h.ul(
            [h.Class("space-y-1")],
            clients.map((client) => {
              const isMe = Option.match(model.myClientId, {
                onNone: () => false,
                onSome: (myId) => myId === client.clientId,
              });

              return h.li(
                [h.Class("flex items-center gap-2 text-xs")],
                [
                  h.span(
                    [
                      h.Class(
                        \`h-2 w-2 rounded-full \${statusDotColor(client.status)}\`,
                      ),
                    ],
                    [],
                  ),
                  h.span(
                    [h.Class("font-mono text-muted-foreground")],
                    [\`\${client.clientId.slice(0, 8)}...\`],
                  ),
                  h.span(
                    [h.Class("text-muted-foreground")],
                    [\`(\${client.status})\`],
                  ),
                  ...(isMe
                    ? [
                        h.span(
                          [
                            h.Class(
                              "text-primary text-[0.6rem] uppercase tracking-[0.2em]",
                            ),
                          ],
                          ["you"],
                        ),
                      ]
                    : []),
                ],
              );
            }),
          ),
      }),
    ],
  );

const statusDotColor = (status: string): string => {
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
`;
