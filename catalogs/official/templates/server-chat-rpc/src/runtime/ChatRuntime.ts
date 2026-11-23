import {
  type AiChatService,
  chatPrompt,
  chatErrorPart,
} from "@repo/ai/AiChatService";
import { FastModelLayer } from "@repo/ai/LanguageModel";
import { type ChatId, type ChatMessage } from "@repo/domain/Chat";
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
    sessionAi?: typeof AiChatService.Service,
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
  return {
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
  } as const;
});

export class ChatRuntime extends Context.Service<ChatRuntime>()("ChatRuntime", {
  make: makeChatRuntime,
}) {
  static readonly layer = Layer.effect(ChatRuntime)(ChatRuntime.make).pipe(
    Layer.provide(ChatRuntimeDependencies),
  );
}
