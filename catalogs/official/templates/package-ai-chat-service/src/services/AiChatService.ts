import type { ChatStreamPart } from "@repo/domain/Chat";
import { Cause, Context, Effect, Layer, Option, Queue, String } from "effect";
import { Chat, Prompt, Toolkit } from "effect/ai";
import { ThinkToolkit, ThinkToolkitLive } from "../toolkits/ThinkToolkit";
import {
  AgenticLoopService,
  AgenticLoopServiceLive,
} from "../workflow/AgenticLoop";

// NOTE: Catalog composition appends additional toolkits to this merge call.
export const ChatToolkit = Toolkit.merge(ThinkToolkit);

// NOTE: Catalog composition appends additional toolkit layers to this merge call.
export const ChatToolkitLive = Layer.mergeAll(ThinkToolkitLive);

export class AiChatService extends Context.Service<AiChatService>()("AiChatService", {
  make: Effect.gen(function* () {
    const toolkit = yield* ChatToolkit;
    const loop = yield* AgenticLoopService;

    const chat = Effect.fn("chat")(function* (history: Array<Prompt.Message>) {
      const queue = yield* Queue.make<ChatStreamPart, Cause.Done>();
      const currentSpan = yield* Effect.currentSpan.pipe(Effect.option);
      const currentParentSpan = yield* Effect.currentParentSpan.pipe(
        Effect.option,
      );
      const generationParentSpan = Option.flatMap(
        currentSpan,
        (span) => span.parent,
      ).pipe(Option.orElse(() => currentParentSpan));

      const runGeneration = Effect.gen(function* () {
        const systemMessage = String.stripMargin(`
              |You are a helpful general assistant.
              |You have access to tools and should use them when appropriate.
              |Be concise and direct in your responses.
            `);

        const session = yield* Chat.fromPrompt(
          Prompt.make(history).pipe(Prompt.appendSystem(systemMessage)),
        );

        yield* loop.run({
          chat: session,
          queue,
          toolkit,
        });
      }).pipe(
        Effect.withSpan("AiChatService.generation", {
          attributes: {
            "chat.messageCount": history.length,
          },
        }),
      );

      const tracedGeneration = Option.match(generationParentSpan, {
        onNone: () => runGeneration,
        onSome: (span) => runGeneration.pipe(Effect.withParentSpan(span)),
      });

      yield* Effect.forkChild(
        tracedGeneration.pipe(
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              yield* Effect.logError("Chat generation failed", cause);
              yield* Queue.offer(queue, {
                _tag: "error",
                message: `System error: ${Cause.pretty(cause)}`,
                recoverable: false,
              });
            }),
          ),
          Effect.ensuring(Queue.end(queue)),
        ),
      );

      return queue;
    });

    return { chat } as const;
  }),
}) {}

export const AiChatServiceLive = Layer.effect(AiChatService)(AiChatService.make).pipe(
  Layer.provide(ChatToolkitLive),
  Layer.provide(AgenticLoopServiceLive),
);
