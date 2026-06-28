// Domain Chat schema
export const domainChatContents = `import { Schema } from "effect";

export const ChatId = Schema.String.pipe(Schema.brand("ChatId"));
export type ChatId = Schema.Schema.Type<typeof ChatId>;

// ============================================================================
// Wire Protocol: ChatStreamPart
// ============================================================================

export const ChatStreamPart = Schema.TaggedUnion({
  text: {
    delta: Schema.String,
  },
  reasoning: {
    delta: Schema.String,
  },
  "tool-start": {
    id: Schema.String,
    name: Schema.String,
    input: Schema.optional(Schema.String),
  },
  "tool-success": {
    id: Schema.String,
    name: Schema.String,
    output: Schema.String,
  },
  "tool-failure": {
    id: Schema.String,
    name: Schema.String,
    error: Schema.String,
  },
  finish: {
    reason: Schema.String,
    usage: Schema.optional(
      Schema.Struct({
        promptTokens: Schema.Number,
        completionTokens: Schema.Number,
        totalTokens: Schema.Number,
      }),
    ),
  },

  error: {
    message: Schema.String,
    recoverable: Schema.Boolean,
  },
});

export type ChatStreamPart = Schema.Schema.Type<typeof ChatStreamPart>;

// ============================================================================
// Chat Message (sent from client to server)
// ============================================================================

export const ChatMessage = Schema.Struct({
  role: Schema.Literals(["user", "assistant", "system"]),
  content: Schema.String,
});

export type ChatMessage = Schema.Schema.Type<typeof ChatMessage>;

// ============================================================================
// Client-Side State Machine: ChatResponse
// ============================================================================

export const ToolCall = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  input: Schema.optional(Schema.String),
  status: Schema.Literals(["running", "complete", "failed"]),
  result: Schema.optional(Schema.String),
});

export type ToolCall = Schema.Schema.Type<typeof ToolCall>;

export const MessageSegment = Schema.TaggedUnion({
  text: {
    content: Schema.String,
    isComplete: Schema.Boolean,
  },
  "tool-call": {
    tool: ToolCall,
  },
});

export type MessageSegment = Schema.Schema.Type<typeof MessageSegment>;

export const UsageMetadata = Schema.Struct({
  promptTokens: Schema.Number,
  completionTokens: Schema.Number,
  totalTokens: Schema.Number,
});

export type UsageMetadata = Schema.Schema.Type<typeof UsageMetadata>;

export const ErrorMetadata = Schema.Struct({
  message: Schema.String,
  recoverable: Schema.Boolean,
});

export type ErrorMetadata = Schema.Schema.Type<typeof ErrorMetadata>;

export const ChatResponse = Schema.TaggedUnion({
  initial: {},
  streaming: {
    segments: Schema.Array(MessageSegment),
    reasoning: Schema.optional(Schema.String),
  },
  complete: {
    segments: Schema.Array(MessageSegment),
    usage: Schema.optional(UsageMetadata),
    finishReason: Schema.String,
  },
  error: {
    segments: Schema.Array(MessageSegment),
    error: ErrorMetadata,
  },
});

export type ChatResponse = Schema.Schema.Type<typeof ChatResponse>;
`;

// Separate ChatRpc group (does NOT touch Rpc.ts)
export const domainChatRpcContents = `import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { ChatId, ChatMessage, ChatStreamPart } from "./Chat";

export class ChatNotFoundError extends Schema.TaggedErrorClass<ChatNotFoundError>()(
  "ChatNotFoundError",
  { chatId: ChatId },
) {}

export class GenerationInProgressError extends Schema.TaggedErrorClass<GenerationInProgressError>()(
  "GenerationInProgressError",
  { chatId: ChatId },
) {}

export class ChatRpc extends RpcGroup.make(
  Rpc.make("chat_start", {
    success: Schema.Struct({
      chatId: ChatId,
    }),
  }),
  Rpc.make("chat_ask", {
    payload: {
      chatId: ChatId,
      messages: Schema.Array(ChatMessage),
    },
    success: ChatStreamPart,
    error: Schema.Union([ChatNotFoundError, GenerationInProgressError]),
    stream: true,
  }),
) {}
`;

// Server chat handler (separate from EventRpc)
export const serverChatRuntimeContents = `import { AiChatService, AiChatServiceLive, FastModelLive } from "@repo/ai";
import { ChatId, type ChatMessage } from "@repo/domain/Chat";
import {
  ChatNotFoundError,
  GenerationInProgressError,
} from "@repo/domain/ChatRpc";
import { Context, Effect, HashMap, Layer, Option, Ref, Stream } from "effect";
import { Prompt } from "effect/unstable/ai";

type ChatSession = {
  readonly active: boolean;
};

const toPromptMessage = (message: ChatMessage) => {
  if (message.role === "system") {
    return Prompt.makeMessage(message.role, {
      content: message.content,
    });
  }

  return Prompt.makeMessage(message.role, {
    content: [Prompt.makePart("text", { text: message.content })],
  });
};

export class ChatRuntime extends Context.Service<ChatRuntime>()("ChatRuntime", {
  make: Effect.gen(function* () {
    const chat = yield* AiChatService;
    const sessions = yield* Ref.make<HashMap.HashMap<ChatId, ChatSession>>(
      HashMap.empty(),
    );

    const release = (chatId: ChatId) =>
      Ref.update(sessions, (current) =>
        Option.match(HashMap.get(current, chatId), {
          onNone: () => current,
          onSome: (session) =>
            HashMap.set(current, chatId, { ...session, active: false }),
        }),
      );

    const reserve = (chatId: ChatId) =>
      Ref.modify(
        sessions,
        (
          current,
        ): readonly [
          Effect.Effect<void, ChatNotFoundError | GenerationInProgressError>,
          HashMap.HashMap<ChatId, ChatSession>,
        ] =>
          Option.match(HashMap.get(current, chatId), {
            onNone: () =>
              [
                Effect.fail(new ChatNotFoundError({ chatId })),
                current,
              ] as const,
            onSome: (session) =>
              session.active
                ? ([
                    Effect.fail(new GenerationInProgressError({ chatId })),
                    current,
                  ] as const)
                : ([
                    Effect.succeed(void 0),
                    HashMap.set(current, chatId, { ...session, active: true }),
                  ] as const),
          }),
      ).pipe(Effect.flatten);

    return {
      start: Effect.gen(function* () {
        const chatId = ChatId.make(crypto.randomUUID());
        const session: ChatSession = { active: false };
        yield* Ref.update(sessions, HashMap.set(chatId, session));
        return { chatId };
      }),
      ask: (chatId: ChatId, messages: ReadonlyArray<ChatMessage>) =>
        Stream.unwrap(
          Effect.gen(function* () {
            yield* reserve(chatId);
            const queue = yield* chat
              .chat(messages.map(toPromptMessage))
              .pipe(Effect.provide(FastModelLive), Effect.orDie);
            return Stream.fromQueue(queue).pipe(
              Stream.ensuring(release(chatId)),
            );
          }),
        ),
    } as const;
  }),
}) {}

export const ChatRuntimeLive = Layer.effect(ChatRuntime)(
  ChatRuntime.make,
).pipe(Layer.provide(AiChatServiceLive));
`;

export const serverChatContents = `import { ChatRpc } from "@repo/domain/ChatRpc";
import { Effect, Layer } from "effect";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { ChatRuntime, ChatRuntimeLive } from "../runtime/ChatRuntime";

const ChatRpcHandlers = ChatRpc.toLayer(
  Effect.gen(function* () {
    const runtime = yield* ChatRuntime;
    yield* Effect.logInfo("Starting Chat RPC Live Implementation");
    return ChatRpc.of({
      chat_start: () => runtime.start,
      chat_ask: ({ chatId, messages }) => runtime.ask(chatId, messages),
    });
  }),
);

export const ChatRpcLive = RpcServer.layerHttp({
  group: ChatRpc,
  path: "/chat-rpc",
  protocol: "http",
}).pipe(
  Layer.provide(ChatRpcHandlers),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(ChatRuntimeLive),
);
`;
