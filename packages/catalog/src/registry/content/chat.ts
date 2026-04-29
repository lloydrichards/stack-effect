// Domain Chat schema
export const domainChatContents = `import { Schema } from "effect";

// ============================================================================
// Wire Protocol: ChatStreamPart
// ============================================================================

export const ChatStreamPart = Schema.Union([
  // Text generation
  Schema.TaggedStruct("text-delta", {
    delta: Schema.String,
  }),
  Schema.TaggedStruct("text-complete", {}),

  // Agent transparency
  Schema.TaggedStruct("thinking", {
    message: Schema.String,
  }),

  // Iteration tracking
  Schema.TaggedStruct("iteration-start", {
    iteration: Schema.Number,
  }),
  Schema.TaggedStruct("iteration-end", {
    iteration: Schema.Number,
  }),

  // Tool call lifecycle
  Schema.TaggedStruct("tool-call-start", {
    id: Schema.String,
    name: Schema.String,
    description: Schema.optional(Schema.String),
  }),
  Schema.TaggedStruct("tool-call-delta", {
    id: Schema.String,
    argumentsDelta: Schema.String,
  }),
  Schema.TaggedStruct("tool-call-complete", {
    id: Schema.String,
    name: Schema.String,
    arguments: Schema.Unknown,
  }),
  Schema.TaggedStruct("tool-execution-start", {
    id: Schema.String,
    name: Schema.String,
  }),
  Schema.TaggedStruct("tool-execution-complete", {
    id: Schema.String,
    name: Schema.String,
    result: Schema.String,
    success: Schema.Boolean,
  }),

  // Completion
  Schema.TaggedStruct("finish", {
    finishReason: Schema.String,
    usage: Schema.optional(
      Schema.Struct({
        promptTokens: Schema.Number,
        completionTokens: Schema.Number,
        totalTokens: Schema.Number,
      }),
    ),
  }),

  // Error
  Schema.TaggedStruct("error", {
    message: Schema.String,
    recoverable: Schema.Boolean,
  }),
]);

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
  arguments: Schema.Unknown,
  argumentsText: Schema.String,
  status: Schema.Literals(["proposed", "executing", "complete", "failed"]),
  result: Schema.optional(Schema.String),
  success: Schema.optional(Schema.Boolean),
});

export type ToolCall = Schema.Schema.Type<typeof ToolCall>;

export const MessageSegment = Schema.Union([
  Schema.TaggedStruct("text", {
    content: Schema.String,
    isComplete: Schema.Boolean,
  }),
  Schema.TaggedStruct("tool-call", {
    tool: ToolCall,
  }),
]);

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

export const ChatResponse = Schema.Union([
  Schema.TaggedStruct("initial", {}),
  Schema.TaggedStruct("streaming", {
    segments: Schema.Array(MessageSegment),
    thinking: Schema.optional(Schema.String),
    currentIteration: Schema.NullOr(Schema.Number),
  }),
  Schema.TaggedStruct("complete", {
    segments: Schema.Array(MessageSegment),
    usage: Schema.optional(UsageMetadata),
    finishReason: Schema.String,
  }),
  Schema.TaggedStruct("error", {
    segments: Schema.Array(MessageSegment),
    error: ErrorMetadata,
  }),
]);

export type ChatResponse = Schema.Schema.Type<typeof ChatResponse>;
`;

// Separate ChatRpc group (does NOT touch Rpc.ts)
export const domainChatRpcContents = `import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { ChatMessage, ChatStreamPart } from "./Chat";

export class ChatRpc extends RpcGroup.make(
  Rpc.make("chat", {
    payload: {
      messages: Schema.Array(ChatMessage),
    },
    success: ChatStreamPart,
    stream: true,
  }),
) {}
`;

// Server chat handler (separate from EventRpc)
export const serverChatContents = `import { ChatService } from "@repo/ai";
import { ChatRpc } from "@repo/domain/ChatRpc";
import { Effect } from "effect";
import { Prompt } from "effect/unstable/ai";

export const ChatRpcLive = ChatRpc.toLayer(
  Effect.gen(function* () {
    const bot = yield* ChatService;
    yield* Effect.logInfo("Starting Chat RPC Live Implementation");
    return ChatRpc.of({
      chat: ({ messages }) =>
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
`;
