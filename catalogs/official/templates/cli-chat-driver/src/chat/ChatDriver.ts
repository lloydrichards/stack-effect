import {
  AiChatService,
  chatPrompt,
  chatErrorPart } from "@repo/ai/AiChatService";
import { FastModelLayer } from "@repo/ai/LanguageModel";
import { type ChatMessage, type ChatStreamPart } from "@repo/domain/Chat";
import {
  type ChatTurnOptions,
  validateChatTurnOptions,
  chatTurnOptionKeys,
} from "@repo/domain/ChatTurnOptions";
import { Context, Effect, Layer, Stream } from "effect";

const TerminalChatDependencies = Layer.mergeAll(AiChatService.layer);
const ChatTurnOptionKeys = chatTurnOptionKeys();
const makeGenerate = Effect.gen(function* () {
  const turn = yield* Effect.all({
    ai: AiChatService,
  });
  return (
    messages: ReadonlyArray<ChatMessage>,
    options: ChatTurnOptions = {},
    inputMessages: ReadonlyArray<ChatMessage> = [],
  ): Stream.Stream<ChatStreamPart> =>
    Stream.unwrap(
      Effect.gen(function* () {
        yield* validateChatTurnOptions(options, ChatTurnOptionKeys);
        const prompt = chatPrompt(messages, {
          input: inputMessages,
        });
        return turn.ai.stream({ prompt });
      }),
    ).pipe(
      Stream.provide(FastModelLayer),
      Stream.catchCause((cause) => Stream.fromEffect(chatErrorPart(cause))),
    );
});

export class TerminalChatDriver extends Context.Service<
  TerminalChatDriver,
  {
    readonly streamTurn: (
      messages: ReadonlyArray<ChatMessage>,
      options?: ChatTurnOptions,
      inputMessages?: ReadonlyArray<ChatMessage>,
    ) => Stream.Stream<ChatStreamPart>;
  }
>()("TerminalChatDriver") {
  static readonly layer = Layer.effect(
    TerminalChatDriver,
    Effect.gen(function* () {
      return TerminalChatDriver.of({ streamTurn: yield* makeGenerate });
    }),
  ).pipe(Layer.provide(TerminalChatDependencies));
}
