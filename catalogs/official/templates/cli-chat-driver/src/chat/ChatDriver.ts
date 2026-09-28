import { AiChatService, AiChatServiceLive, FastModelLive } from "@repo/ai";
import type { ChatMessage, ChatStreamPart } from "@repo/domain/Chat";
import { Array, Context, Effect, Layer, Match, pipe, Stream } from "effect";
import { Prompt } from "effect/unstable/ai";

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

export class TerminalChatDriver extends Context.Service<TerminalChatDriver>()(
  "TerminalChatDriver",
  {
    make: Effect.gen(function* () {
      const chat = yield* AiChatService;

      const streamTurn = (
        messages: ReadonlyArray<ChatMessage>,
      ): Stream.Stream<ChatStreamPart> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const promptMessages: Array<Prompt.Message> = pipe(
              messages,
              Array.map(toPromptMessage),
            );

            const queue = yield* chat
              .chat(promptMessages)
              .pipe(Effect.provide(FastModelLive), Effect.orDie);

            return Stream.fromQueue(queue);
          }),
        );

      return {
        streamTurn,
      } as const;
    }),
  },
) {}

export const TerminalChatDriverLive = Layer.effect(TerminalChatDriver)(
  TerminalChatDriver.make,
).pipe(Layer.provide(AiChatServiceLive));
