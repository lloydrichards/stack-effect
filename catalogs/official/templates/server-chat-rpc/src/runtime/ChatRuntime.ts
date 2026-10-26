import { AiChatService, AiChatServiceLive, FastModelLive } from "@repo/ai";
import { ChatPreparationError, type ChatId, type ChatMessage } from "@repo/domain/Chat";
import {
  type ChatTurnOptions,
  chatTurnOptionKeys,
  validateChatTurnOptions,
} from "@repo/domain/ChatTurnOptions";
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

const ChatTurnOptionKeys = chatTurnOptionKeys();
const ChatTurnPreparations = Effect.all([
  Effect.succeed((options: ChatTurnOptions) =>
    validateChatTurnOptions(options, ChatTurnOptionKeys).pipe(Effect.mapError((error) => new ChatPreparationError({ reason: { code: "invalid-input", message: error.message, source: "chat-options" } }))),
  ),
]);
const ChatRuntimeDependencies = Layer.mergeAll(AiChatServiceLive);

export class ChatRuntime extends Context.Service<ChatRuntime>()("ChatRuntime", {
  make: Effect.gen(function* () {
    const chat = yield* AiChatService;
    const preparations = yield* ChatTurnPreparations;
    const sessions = yield* ChatSessions;

    const generate = (
      messages: ReadonlyArray<ChatMessage>,
      options: ChatTurnOptions = {},
    ) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const turnPreparations = preparations.map((prepare) =>
            Effect.fnUntraced(function* () {
              return yield* prepare(options);
            }),
          );
          const queue = yield* chat.chat(
            messages.map(toPromptMessage),
            turnPreparations,
          );
          return Stream.fromQueue(queue);
        }),
      ).pipe(Stream.provide(FastModelLive), Stream.orDie);

    return {
      start: sessions.start,
      generate,
      ask: (
        chatId: ChatId,
        messages: ReadonlyArray<ChatMessage>,
        options: ChatTurnOptions = {},
      ) =>
        Stream.unwrap(
          Effect.gen(function* () {
            yield* sessions.reserve(chatId);
            return generate(messages, options).pipe(
              Stream.ensuring(sessions.release(chatId)),
            );
          }),
        ),
    } as const;
  }),
}) {}

export const ChatRuntimeLive = Layer.effect(ChatRuntime)(ChatRuntime.make).pipe(
  Layer.provide(ChatRuntimeDependencies),
);
