import {
  AiChatService,
  AiChatServiceLive,
  chatPrompt,
  chatErrorPart,
  FastModelLive,
} from "@repo/ai";
import { type ChatId, type ChatMessage } from "@repo/domain/Chat";
import {
  type ChatTurnOptions,
  validateChatTurnOptions,
  chatTurnOptionKeys,
} from "@repo/domain/ChatTurnOptions";
import { Context, Effect, Layer, Stream } from "effect";
import { ChatSessions } from "./ChatSessions";

const ChatRuntimeDependencies = Layer.mergeAll(AiChatServiceLive);
const ChatTurnOptionKeys = chatTurnOptionKeys();
const makeGenerate = Effect.gen(function* () {
  const turn = yield* Effect.all({
    ai: AiChatService,
  });
  return (
    messages: ReadonlyArray<ChatMessage>,
    options: ChatTurnOptions = {},
  ) =>
    Stream.unwrap(
      Effect.gen(function* () {
        yield* validateChatTurnOptions(options, ChatTurnOptionKeys);
        const prompt = chatPrompt(messages, {});
        return turn.ai.stream({ prompt });
      }),
    ).pipe(
      Stream.provide(FastModelLive),
      Stream.catchCause((cause) => Stream.fromEffect(chatErrorPart(cause))),
    );
});

export class ChatRuntime extends Context.Service<ChatRuntime>()("ChatRuntime", {
  make: Effect.gen(function* () {
    const sessions = yield* ChatSessions;

    const generate = yield* makeGenerate;
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
