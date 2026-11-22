import {
  AiChatService,
  chatPrompt,
  chatErrorPart,
  FastModelLayer } from "@repo/ai";
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

export class TerminalChatDriver extends Context.Service<TerminalChatDriver>()(
  "TerminalChatDriver",
  {
    make: Effect.gen(function* () {
      const streamTurn = yield* makeGenerate;
      return { streamTurn } as const;
    }),
  },
) {
  static readonly layer = Layer.effect(TerminalChatDriver)(
    TerminalChatDriver.make,
  ).pipe(Layer.provide(TerminalChatDependencies));
}
