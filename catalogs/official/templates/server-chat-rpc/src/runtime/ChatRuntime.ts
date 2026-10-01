import { AiChatService, AiChatServiceLive, FastModelLive } from "@repo/ai";
import type { ChatId, ChatMessage } from "@repo/domain/Chat";
import { Context, Effect, Layer, Stream } from "effect";
import { Prompt } from "effect/ai";
import { ChatSessions } from "./ChatSessions";

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
    const sessions = yield* ChatSessions;

    const generate = (messages: ReadonlyArray<ChatMessage>) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const queue = yield* chat.chat(messages.map(toPromptMessage));
          return Stream.fromQueue(queue);
        }),
      ).pipe(Stream.provide(FastModelLive), Stream.orDie);

    return {
      start: sessions.start,
      generate,
      ask: (chatId: ChatId, messages: ReadonlyArray<ChatMessage>) =>
        Stream.unwrap(
          Effect.gen(function* () {
            yield* sessions.reserve(chatId);
            return generate(messages).pipe(
              Stream.ensuring(sessions.release(chatId)),
            );
          }),
        ),
    } as const;
  }),
}) {}

export const ChatRuntimeLive = Layer.effect(ChatRuntime)(ChatRuntime.make).pipe(
  Layer.provide(AiChatServiceLive),
);
