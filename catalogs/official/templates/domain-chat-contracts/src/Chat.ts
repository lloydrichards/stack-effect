import { Schema } from "effect";

export const ChatId = Schema.String.pipe(Schema.brand("ChatId"));
export type ChatId = typeof ChatId.Type;

export const ChatFailure = Schema.Struct({
  code: Schema.Literals([
    "invalid-input",
    "unsupported-content",
    "remote-failure",
    "tool-conflict",
  ]),
  message: Schema.String,
  source: Schema.optional(Schema.String),
});
export type ChatFailure = typeof ChatFailure.Type;

export class ChatPreparationError extends Schema.TaggedError<ChatPreparationError, { readonly brand: unique symbol }>()(
  "ChatPreparationError",
  { reason: ChatFailure },
) {
  override get message() {
    return this.reason.message;
  }
}

export const ChatStepLimit = {
  reason: "max-iterations",
  message: "Chat reached its model round limit.",
} as const;

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
        promptTokens: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
        completionTokens: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
        totalTokens: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      }),
    ),
  },

  error: {
    message: Schema.String,
    recoverable: Schema.Boolean,
    reason: Schema.optional(ChatFailure),
  },
});

export type ChatStreamPart = typeof ChatStreamPart.Type;

export const ChatMessage = Schema.Struct({
  role: Schema.Literals(["user", "assistant", "system"]),
  content: Schema.String,
});

export type ChatMessage = typeof ChatMessage.Type;

export const ToolCall = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  input: Schema.optional(Schema.String),
  status: Schema.Literals(["running", "complete", "failed"]),
  result: Schema.optional(Schema.String),
});

export type ToolCall = typeof ToolCall.Type;

export const MessageSegment = Schema.TaggedUnion({
  text: {
    content: Schema.String,
    isComplete: Schema.Boolean,
  },
  "tool-call": {
    tool: ToolCall,
  },
});

export type MessageSegment = typeof MessageSegment.Type;

export const UsageMetadata = Schema.Struct({
  promptTokens: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  completionTokens: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  totalTokens: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export type UsageMetadata = typeof UsageMetadata.Type;

export const ErrorMetadata = Schema.Struct({
  message: Schema.String,
  recoverable: Schema.Boolean,
  reason: Schema.optional(ChatFailure),
});

export type ErrorMetadata = typeof ErrorMetadata.Type;

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

export type ChatResponse = typeof ChatResponse.Type;
