import {
  type AiChatService,
  chatPrompt,
  chatErrorPart,
} from "@repo/ai/AiChatService";
import { FastModelLayer } from "@repo/ai/LanguageModel";
import {
  type ChatId,
  type ChatMessage,
  type ChatStreamPart,
} from "@repo/domain/Chat";
import type { ChatNotFound, GenerationInProgress } from "@repo/domain/ChatRpc";
import {
  type ChatTurnOptions,
  validateChatTurnOptions,
  chatTurnOptionKeys,
} from "@repo/domain/ChatTurnOptions";
import { Context, Effect, Layer, Stream } from "effect";
import { ChatSessions, makeSessionAi } from "./ChatSessions";

const ChatRuntimeDependencies = Layer.mergeAll(Layer.empty);
const ChatTurnOptionKeys = chatTurnOptionKeys();
const makeChatRuntime = Effect.gen(function* () {
  const turn = yield* Effect.all({
    sessions: ChatSessions,
  });
  const generate = (
    messages: ReadonlyArray<ChatMessage>,
    options: ChatTurnOptions = {},
    sessionAi?: AiChatService["Service"],
  ) =>
    Stream.unwrap(
      Effect.gen(function* () {
        yield* validateChatTurnOptions(options, ChatTurnOptionKeys);
        const ai = sessionAi ?? (yield* makeSessionAi);
        const prompt = chatPrompt(messages, {});
        return ai.stream({ prompt });
      }),
    ).pipe(
      Stream.provide(FastModelLayer),
      Stream.catchCause((cause) => Stream.fromEffect(chatErrorPart(cause))),
    );
  return ChatRuntime.of({
    start: turn.sessions.start,
    generate,
    ask: (
      chatId: ChatId,
      messages: ReadonlyArray<ChatMessage>,
      options: ChatTurnOptions = {},
    ) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const ai = yield* turn.sessions.reserveScoped(chatId);
          return generate(messages, options, ai);
        }),
      ),
  });
});

export class ChatRuntime extends Context.Service<
  ChatRuntime,
  {
    readonly start: Effect.Effect<{ readonly chatId: ChatId }>;
    readonly generate: (
      messages: ReadonlyArray<ChatMessage>,
      options?: ChatTurnOptions,
      sessionAi?: AiChatService["Service"],
    ) => Stream.Stream<ChatStreamPart>;
    readonly ask: (
      chatId: ChatId,
      messages: ReadonlyArray<ChatMessage>,
      options?: ChatTurnOptions,
    ) => Stream.Stream<ChatStreamPart, ChatNotFound | GenerationInProgress>;
  }
>()("ChatRuntime") {
  static readonly layer = Layer.effect(ChatRuntime, makeChatRuntime).pipe(
    Layer.provide(ChatRuntimeDependencies),
  );
}
