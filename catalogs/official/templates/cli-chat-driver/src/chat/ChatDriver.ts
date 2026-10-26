import { AiChatService, AiChatServiceLive, FastModelLive } from "@repo/ai";
import { ChatPreparationError, type ChatMessage, type ChatStreamPart } from "@repo/domain/Chat";
import {
  type ChatTurnOptions,
  chatTurnOptionKeys,
  validateChatTurnOptions,
} from "@repo/domain/ChatTurnOptions";
import { Array, Context, Effect, Layer, Match, pipe, Stream } from "effect";
import { Prompt } from "effect/ai";

// NOTE: CLI chat keeps this converter local to avoid depending on server/RPC modules.
const toPromptMessage = (message: ChatMessage) => {
  return pipe(
    Match.value(message.role),
    Match.when("system", () =>
      Prompt.systemMessage({ content: message.content }),
    ),
    Match.when("user", () =>
      Prompt.userMessage({
        content: [Prompt.textPart({ text: message.content })],
      }),
    ),
    Match.when("assistant", () =>
      Prompt.assistantMessage({
        content: [Prompt.textPart({ text: message.content })],
      }),
    ),
    Match.exhaustive,
  );
};

const ChatTurnOptionKeys = chatTurnOptionKeys();
const ChatTurnPreparations = Effect.all([
  Effect.succeed((options: ChatTurnOptions) =>
    validateChatTurnOptions(options, ChatTurnOptionKeys).pipe(Effect.mapError((error) => new ChatPreparationError({ reason: { code: "invalid-input", message: error.message, source: "chat-options" } }))),
  ),
]);
const TerminalChatDependencies = Layer.mergeAll(AiChatServiceLive);

export class TerminalChatDriver extends Context.Service<TerminalChatDriver>()(
  "TerminalChatDriver",
  {
    make: Effect.gen(function* () {
      const chat = yield* AiChatService;
      const preparations = yield* ChatTurnPreparations;

      const streamTurn = (
        messages: ReadonlyArray<ChatMessage>,
        options: ChatTurnOptions = {},
        inputMessages: ReadonlyArray<ChatMessage> = [],
      ): Stream.Stream<ChatStreamPart> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const promptMessages: Array<Prompt.Message> = pipe(
              messages,
              Array.map(toPromptMessage),
            );

            const turnPreparations = preparations.map((prepare) =>
              Effect.fnUntraced(function* () {
                return yield* prepare(options);
              }),
            );
            const queue = yield* chat
              .chat(promptMessages, [
                ...turnPreparations,
                () => Effect.succeed({ inputMessages: inputMessages.map(toPromptMessage) }),
              ])
              .pipe(Effect.provide(FastModelLive), Effect.orDie);

            return Stream.fromQueue(queue);
          }),
        );

      return { streamTurn } as const;
    }),
  },
) {}

export const TerminalChatDriverLive = Layer.effect(TerminalChatDriver)(
  TerminalChatDriver.make,
).pipe(Layer.provide(TerminalChatDependencies));
