import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { ChatId, ChatMessage, ChatStreamPart } from "./Chat";
import { ChatTurnOptions } from "./ChatTurnOptions";

export class ChatNotFound extends Schema.TaggedError<ChatNotFound, { readonly brand: unique symbol }>()(
  "ChatNotFound",
  { chatId: ChatId },
) {}

export class GenerationInProgress extends Schema.TaggedError<GenerationInProgress, { readonly brand: unique symbol }>()(
  "GenerationInProgress",
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
      options: Schema.optional(ChatTurnOptions),
    },
    success: ChatStreamPart,
    error: Schema.Union([ChatNotFound, GenerationInProgress]),
    stream: true,
  }),
) {}
