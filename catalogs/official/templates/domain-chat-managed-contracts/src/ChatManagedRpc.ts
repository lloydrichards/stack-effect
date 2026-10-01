import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { ChatId, ChatMessage, ChatStreamPart } from "./Chat";
import { ChatNotFoundError, GenerationInProgressError } from "./ChatRpc";

export const ChatWatchEvent = Schema.TaggedUnion({
  "user-message": {
    message: ChatMessage,
  },
  "assistant-part": {
    part: ChatStreamPart,
  },
});

export type ChatWatchEvent = Schema.Schema.Type<typeof ChatWatchEvent>;

export class ChatManagedRpc extends RpcGroup.make(
  Rpc.make("chat_send", {
    payload: {
      chatId: ChatId,
      message: ChatMessage,
    },
    success: Schema.Void,
    error: Schema.Union([ChatNotFoundError, GenerationInProgressError]),
  }),
  Rpc.make("chat_watch", {
    payload: {
      chatId: ChatId,
    },
    success: ChatWatchEvent,
    error: ChatNotFoundError,
    stream: true,
  }),
  Rpc.make("chat_interrupt", {
    payload: {
      chatId: ChatId,
    },
    success: Schema.Void,
    error: ChatNotFoundError,
  }),
) {}
