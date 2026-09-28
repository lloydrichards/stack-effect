import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { ChatId, ChatMessage, ChatStreamPart } from "./Chat";

export class ChatNotFoundError extends Schema.TaggedError<ChatNotFoundError>()(
  "ChatNotFoundError",
  { chatId: ChatId },
) {}

export class GenerationInProgressError extends Schema.TaggedError<GenerationInProgressError>()(
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
