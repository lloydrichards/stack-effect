export const foldkitChatClientContents = `import { ChatRpc } from "@repo/domain/ChatRpc";
import { Context, Layer } from "effect";
import {
  RpcClient as EffectRpcClient,
  RpcClientError,
} from "effect/unstable/rpc";
import { RpcProtocolLive } from "./rpc-client";

type ChatRpcClient = EffectRpcClient.FromGroup<
  typeof ChatRpc,
  RpcClientError.RpcClientError
>;

export class ChatClient extends Context.Service<ChatClient, ChatRpcClient>()(
  "ChatClient",
) {}

export const ChatClientLive = Layer.effect(
  ChatClient,
  EffectRpcClient.make(ChatRpc),
).pipe(Layer.provide(RpcProtocolLive));
`;

export const foldkitChatFeatureContents = `import {
  type ChatMessage,
  ChatStreamPart,
  MessageSegment,
  type ToolCall,
} from "@repo/domain/Chat";
import { Effect, Match, Option, Schema, Stream } from "effect";
import { Command, Subscription } from "foldkit";
import type { Html } from "foldkit/html";
import { html } from "foldkit/html";
import { m } from "foldkit/message";
import { evo } from "foldkit/struct";
import { ChatClient, ChatClientLive } from "../services/chat-client";

// MODEL

const ChatMessageSchema = Schema.Struct({
  role: Schema.Literals(["user", "assistant", "system"]),
  content: Schema.String,
  segments: Schema.Option(Schema.Array(MessageSegment)),
});

const ChatStateSchema = Schema.Literals([
  "idle",
  "streaming",
  "complete",
  "error",
]);

export const Model = Schema.Struct({
  chatInput: Schema.String,
  chatHistory: Schema.Array(ChatMessageSchema),
  chatState: ChatStateSchema,
  chatSegments: Schema.Array(MessageSegment),
  chatThinking: Schema.Option(Schema.String),
  chatCurrentIteration: Schema.Option(Schema.Number),
  chatError: Schema.Option(Schema.String),
  chatStreaming: Schema.Boolean,
});
export type Model = typeof Model.Type;

// MESSAGE

export const UpdatedChatInput = m("UpdatedChatInput", { value: Schema.String });
export const SubmittedChatMessage = m("SubmittedChatMessage");
export const ReceivedChatPart = m("ReceivedChatPart", {
  part: ChatStreamPart,
});
export const CompletedChatStream = m("CompletedChatStream");
export const FailedChatStream = m("FailedChatStream", { error: Schema.String });

export const Message = Schema.Union([
  UpdatedChatInput,
  SubmittedChatMessage,
  ReceivedChatPart,
  CompletedChatStream,
  FailedChatStream,
]);
export type Message = typeof Message.Type;

// GOT MESSAGE (parent wrapper)

export const GotMessage = m("GotChatMessage", { message: Message });

// INIT

export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [
  {
    chatInput: "",
    chatHistory: [],
    chatState: "idle",
    chatSegments: [],
    chatThinking: Option.none(),
    chatCurrentIteration: Option.none(),
    chatError: Option.none(),
    chatStreaming: false,
  },
  [],
];

// HELPERS

type MutableSegment =
  | { _tag: "text"; content: string; isComplete: boolean }
  | { _tag: "tool-call"; tool: ToolCall };

const applyChatPart = (
  model: Model,
  part: typeof ChatStreamPart.Type,
): Model => {
  const segments: Array<MutableSegment> = [...model.chatSegments];

  return Match.valueTags(part, {
    "text-delta": ({ delta }) => {
      const last = segments[segments.length - 1];
      if (last?._tag === "text" && !last.isComplete) {
        return evo(model, {
          chatSegments: () => [
            ...segments.slice(0, -1),
            {
              _tag: "text" as const,
              content: last.content + delta,
              isComplete: false,
            },
          ],
        });
      }
      return evo(model, {
        chatSegments: () => [
          ...segments,
          { _tag: "text" as const, content: delta, isComplete: false },
        ],
      });
    },
    "text-complete": () => {
      const last = segments[segments.length - 1];
      if (last?._tag === "text" && !last.isComplete) {
        return evo(model, {
          chatSegments: () => [
            ...segments.slice(0, -1),
            { ...last, isComplete: true },
          ],
        });
      }
      return model;
    },
    thinking: ({ message }) =>
      evo(model, { chatThinking: () => Option.some(message) }),
    "iteration-start": ({ iteration }) =>
      evo(model, { chatCurrentIteration: () => Option.some(iteration) }),
    "iteration-end": () =>
      evo(model, { chatCurrentIteration: () => Option.none() }),
    "tool-call-start": ({ id, name }) =>
      evo(model, {
        chatSegments: () => [
          ...segments,
          {
            _tag: "tool-call" as const,
            tool: {
              id,
              name,
              arguments: null,
              argumentsText: "",
              status: "proposed" as const,
            },
          },
        ],
      }),
    "tool-call-delta": ({ id, argumentsDelta }) =>
      evo(model, {
        chatSegments: () =>
          segments.map((seg) =>
            seg._tag === "tool-call" && seg.tool.id === id
              ? {
                  ...seg,
                  tool: {
                    ...seg.tool,
                    argumentsText: seg.tool.argumentsText + argumentsDelta,
                  },
                }
              : seg,
          ),
      }),
    "tool-call-complete": ({ id, arguments: args }) =>
      evo(model, {
        chatSegments: () =>
          segments.map((seg) =>
            seg._tag === "tool-call" && seg.tool.id === id
              ? { ...seg, tool: { ...seg.tool, arguments: args } }
              : seg,
          ),
      }),
    "tool-execution-start": ({ id }) =>
      evo(model, {
        chatSegments: () =>
          segments.map((seg) =>
            seg._tag === "tool-call" && seg.tool.id === id
              ? {
                  ...seg,
                  tool: { ...seg.tool, status: "executing" as const },
                }
              : seg,
          ),
      }),
    "tool-execution-complete": ({ id, success, result }) =>
      evo(model, {
        chatSegments: () =>
          segments.map((seg) =>
            seg._tag === "tool-call" && seg.tool.id === id
              ? {
                  ...seg,
                  tool: {
                    ...seg.tool,
                    status: success
                      ? ("complete" as const)
                      : ("failed" as const),
                    result,
                    success,
                  },
                }
              : seg,
          ),
      }),
    finish: () =>
      evo(model, {
        chatState: () => "complete" as const,
        chatStreaming: () => false,
      }),
    error: ({ message }) =>
      evo(model, {
        chatState: () => "error" as const,
        chatStreaming: () => false,
        chatError: () => Option.some(message),
      }),
  });
};

const extractTextFromSegments = (
  segments: ReadonlyArray<typeof MessageSegment.Type>,
): string =>
  segments
    .filter(
      (seg): seg is typeof MessageSegment.Type & { _tag: "text" } =>
        seg._tag === "text",
    )
    .map((seg) => seg.content)
    .join("");

// UPDATE

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  return Match.valueTags(message, {
    UpdatedChatInput: ({ value }) =>
      [evo(model, { chatInput: () => value }), []] as const,
    SubmittedChatMessage: () => {
      const trimmed = model.chatInput.trim();
      if (trimmed === "") return [model, []] as const;

      return [
        evo(model, {
          chatInput: () => "",
          chatHistory: (prev) => [
            ...prev,
            {
              role: "user" as const,
              content: trimmed,
              segments: Option.none(),
            },
          ],
          chatState: () => "streaming" as const,
          chatStreaming: () => true,
          chatSegments: () => [],
          chatThinking: () => Option.none(),
          chatCurrentIteration: () => Option.none(),
          chatError: () => Option.none(),
        }),
        [],
      ] as const;
    },
    ReceivedChatPart: ({ part }) => [applyChatPart(model, part), []] as const,
    CompletedChatStream: () =>
      [
        evo(model, {
          chatState: () => "complete" as const,
          chatStreaming: () => false,
          chatHistory: (prev) => [
            ...prev,
            {
              role: "assistant" as const,
              content: extractTextFromSegments(model.chatSegments),
              segments: Option.some([...model.chatSegments]),
            },
          ],
          chatSegments: () => [],
          chatThinking: () => Option.none(),
          chatCurrentIteration: () => Option.none(),
        }),
        [],
      ] as const,
    FailedChatStream: ({ error }) =>
      [
        evo(model, {
          chatState: () => "error" as const,
          chatStreaming: () => false,
          chatError: () => Option.some(error),
        }),
        [],
      ] as const,
  });
};

// SUBSCRIPTION

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  chatStream: entry(
    { isStreaming: Schema.Boolean, messagesJson: Schema.String },
    {
      modelToDependencies: (model) => ({
        isStreaming: model.chatStreaming,
        messagesJson: model.chatStreaming
          ? JSON.stringify(
              model.chatHistory.map((msg) => ({
                role: msg.role,
                content: msg.content,
              })),
            )
          : "[]",
      }),
      dependenciesToStream: ({ isStreaming, messagesJson }) =>
        isStreaming
          ? Effect.gen(function* () {
              const client = yield* ChatClient;
              const messages: Array<ChatMessage> = JSON.parse(messagesJson);
              return client.chat({ messages }).pipe(
                Stream.map((part) => ReceivedChatPart({ part })),
                Stream.concat(Stream.make(CompletedChatStream())),
                Stream.catch(() =>
                  Stream.make(
                    FailedChatStream({ error: "Chat stream failed" }),
                  ),
                ),
              );
            }).pipe(Stream.unwrap, Stream.provide(ChatClientLive))
          : Stream.empty,
    },
  ),
}));

// VIEW

export const view = <ParentMessage>(
  model: Model,
  toParentMessage: (message: Message) => ParentMessage,
): Html => {
  const h = html<ParentMessage>();
  const isStreaming = model.chatState === "streaming";
  const isDisabled = isStreaming;

  return h.div(
    [
      h.Class(
        "rounded-lg border bg-card text-card-foreground shadow-sm h-full w-full flex flex-col",
      ),
    ],
    [
      h.div(
        [
          h.Class(
            "flex flex-col space-y-1.5 p-6 border-b border-border flex-row items-center justify-between",
          ),
        ],
        [
          h.h3(
            [h.Class("font-semibold leading-none tracking-tight")],
            ["Chat (RPC)"],
          ),
          h.div(
            [h.Class("flex gap-2")],
            [
              ...(isStreaming
                ? [
                    h.span(
                      [
                        h.Class(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-border bg-secondary text-[0.65rem] uppercase tracking-[0.2em] text-secondary-foreground",
                        ),
                      ],
                      ["Streaming"],
                    ),
                  ]
                : []),
              ...Option.match(model.chatCurrentIteration, {
                onNone: (): Array<Html> => [],
                onSome: (iteration) => [
                  h.span(
                    [
                      h.Class(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-border bg-secondary text-[0.65rem] uppercase tracking-[0.2em] text-secondary-foreground",
                      ),
                    ],
                    [\`Iteration \${iteration}\`],
                  ),
                ],
              }),
              ...(model.chatState === "error"
                ? [
                    h.span(
                      [
                        h.Class(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-destructive text-destructive-foreground text-[0.65rem] uppercase tracking-[0.2em]",
                        ),
                      ],
                      ["Error"],
                    ),
                  ]
                : []),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class("flex-1 min-h-0 overflow-y-auto px-4")],
        [
          h.div(
            [h.Class("space-y-4 py-4")],
            [
              ...emptyStateView(h, model),
              ...historyView(h, model),
              ...streamingSegmentsView(h, model),
              ...thinkingView(h, model),
              ...errorView(h, model),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class("flex items-center p-6 border-t border-border")],
        [
          h.form(
            [
              h.Class("flex w-full gap-2"),
              h.OnSubmit(toParentMessage(SubmittedChatMessage())),
            ],
            [
              h.input([
                h.Type("text"),
                h.Value(model.chatInput),
                h.Placeholder("Send a message"),
                h.OnInput((value) =>
                  toParentMessage(UpdatedChatInput({ value })),
                ),
                h.Class(
                  "flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                ),
                ...(isDisabled ? [h.Disabled(true)] : []),
              ]),
              h.button(
                [
                  h.Class(
                    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2",
                  ),
                  h.OnClick(toParentMessage(SubmittedChatMessage())),
                  ...(isDisabled || model.chatInput.trim() === ""
                    ? [h.Disabled(true)]
                    : []),
                ],
                ["Send"],
              ),
            ],
          ),
        ],
      ),
    ],
  );
};

// VIEW HELPERS

const emptyStateView = <ParentMessage>(
  h: ReturnType<typeof html<ParentMessage>>,
  model: Model,
): Array<Html> => {
  if (model.chatHistory.length > 0 || model.chatSegments.length > 0) return [];
  return [
    h.div(
      [
        h.Class(
          "flex flex-col items-start gap-2 rounded-none border border-border bg-muted/50 px-4 py-6 text-xs text-muted-foreground",
        ),
      ],
      [
        h.p(
          [h.Class("text-[0.65rem] uppercase tracking-[0.28em]")],
          ["Empty channel"],
        ),
        h.p(
          [h.Class("text-xs text-foreground")],
          ["Start with a clear request."],
        ),
      ],
    ),
  ];
};

const historyView = <ParentMessage>(
  h: ReturnType<typeof html<ParentMessage>>,
  model: Model,
): Array<Html> =>
  model.chatHistory.map((msg) =>
    msg.role === "user"
      ? h.div(
          [h.Class("flex w-full flex-col gap-2 items-end mb-8")],
          [
            h.div(
              [
                h.Class(
                  "max-w-[85%] rounded-none border border-primary/40 bg-primary px-4 py-2 text-xs text-primary-foreground shadow-xs whitespace-break-spaces",
                ),
              ],
              [msg.content],
            ),
          ],
        )
      : h.div(
          [h.Class("flex w-full flex-col gap-2 items-start")],
          Option.match(msg.segments, {
            onNone: () => [
              h.div([h.Class("w-full py-2 text-xs")], [msg.content]),
            ],
            onSome: (segs) => segmentsView(h, segs),
          }),
        ),
  );

const streamingSegmentsView = <ParentMessage>(
  h: ReturnType<typeof html<ParentMessage>>,
  model: Model,
): Array<Html> => {
  if (model.chatSegments.length === 0) return [];
  if (model.chatState !== "streaming") return [];
  return [
    h.div(
      [h.Class("flex w-full flex-col gap-2 items-start")],
      segmentsView(h, [...model.chatSegments]),
    ),
  ];
};

const segmentsView = <ParentMessage>(
  h: ReturnType<typeof html<ParentMessage>>,
  segments: ReadonlyArray<typeof MessageSegment.Type>,
): Array<Html> =>
  segments.map((segment) =>
    segment._tag === "text"
      ? h.div(
          [h.Class("w-full py-2 text-xs whitespace-pre-wrap")],
          [segment.content],
        )
      : toolCallView(h, segment.tool),
  );

const toolCallView = <ParentMessage>(
  h: ReturnType<typeof html<ParentMessage>>,
  tool: ToolCall,
): Html => {
  const statusIcon =
    tool.status === "executing"
      ? "..."
      : tool.status === "complete"
        ? "ok"
        : tool.status === "failed"
          ? "!!"
          : "?";

  return h.div(
    [
      h.Class(
        "w-full rounded-none border border-border bg-muted/50 px-3 py-2 text-xs",
      ),
    ],
    [
      h.div(
        [h.Class("flex items-center gap-2")],
        [
          h.span([h.Class("font-mono text-muted-foreground")], [statusIcon]),
          h.span([h.Class("font-medium")], [tool.name]),
          h.span(
            [
              h.Class(
                \`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.6rem] font-semibold \${
                  tool.status === "complete"
                    ? "bg-primary text-primary-foreground"
                    : tool.status === "failed"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-secondary text-secondary-foreground"
                }\`,
              ),
            ],
            [tool.status],
          ),
        ],
      ),
      ...(tool.result
        ? [
            h.div(
              [h.Class("mt-1 text-muted-foreground truncate max-w-full")],
              [tool.result.slice(0, 200)],
            ),
          ]
        : []),
    ],
  );
};

const thinkingView = <ParentMessage>(
  h: ReturnType<typeof html<ParentMessage>>,
  model: Model,
): Array<Html> =>
  Option.match(model.chatThinking, {
    onNone: () => [],
    onSome: (thinking) => [
      h.div(
        [h.Class("flex w-full flex-col gap-2 items-start")],
        [
          h.div(
            [
              h.Class(
                "inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted-foreground",
              ),
            ],
            [\`Thinking: \${thinking}\`],
          ),
        ],
      ),
    ],
  });

const errorView = <ParentMessage>(
  h: ReturnType<typeof html<ParentMessage>>,
  model: Model,
): Array<Html> =>
  Option.match(model.chatError, {
    onNone: () => [],
    onSome: (error) => [
      h.div(
        [
          h.Class(
            "text-destructive text-xs p-3 border border-destructive/40 bg-destructive/10 rounded-none",
          ),
        ],
        [
          h.div(
            [h.Class("flex items-start gap-2")],
            [h.span([h.Class("font-medium text-foreground")], [error])],
          ),
        ],
      ),
    ],
  });
`;
