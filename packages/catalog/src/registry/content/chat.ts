// Domain Chat schema
export const domainChatContents = `import { Schema } from "effect";

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
import { ChatMessage, ChatStreamPart } from "./Chat";

export class ChatRpc extends RpcGroup.make(
  Rpc.make("chat_ask", {
    payload: {
      messages: Schema.Array(ChatMessage),
    },
    success: ChatStreamPart,
    stream: true,
  }),
) {}
`;

// Server chat handler (separate from EventRpc)
export const serverChatContents = `import { ChatService, ChatServiceLive, FastModelLive } from "@repo/ai";
import { ChatRpc } from "@repo/domain/ChatRpc";
import { Effect, Layer } from "effect";
import { Prompt } from "effect/unstable/ai";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

const ChatRpcHandlers = ChatRpc.toLayer(
  Effect.gen(function* () {
    const bot = yield* ChatService;
    yield* Effect.logInfo("Starting Chat RPC Live Implementation");
    return ChatRpc.of({
      chat_ask: ({ messages }) =>
        bot.chat(
          messages.map((msg) => {
            if (msg.role === "system") {
              return Prompt.makeMessage(msg.role, {
                content: msg.content,
              });
            }
            return Prompt.makeMessage(msg.role, {
              content: [Prompt.makePart("text", { text: msg.content })],
            });
          }),
        ),
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
  Layer.provide([ChatServiceLive, FastModelLive]),
);
`;
