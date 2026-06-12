import type { ChatStreamPart } from "@repo/domain/Chat";
import { Cause, Context, Effect, Layer, Queue, String } from "effect";
import { Chat, Prompt, Toolkit } from "effect/unstable/ai";
import {
  DateTimeToolkit,
  DateTimeToolkitLive,
} from "../toolkits/DateTimeToolkit";
import { MathToolkit, MathToolkitLive } from "../toolkits/MathToolkit";
import { InMemoryToolkitLive, MemoryToolkit } from "../toolkits/MemoryToolkit";
import { PlanToolkit, PlanToolkitLive } from "../toolkits/PlanToolkit";
import { ThinkToolkit, ThinkToolkitLive } from "../toolkits/ThinkToolkit";
import {
  WebFetchToolkit,
  WebFetchToolkitLive,
} from "../toolkits/WebFetchToolkit";
import { runAgenticLoop } from "../workflow/AgenticLoop";

// ChatToolkit - Merged toolkit for the chat service
// AST can append additional toolkits to this merge call
export const ChatToolkit = Toolkit.merge(
  ThinkToolkit,
  DateTimeToolkit,
  MathToolkit,
  MemoryToolkit,
  PlanToolkit,
  WebFetchToolkit,
);

// ChatToolkitLive - Merged layer providing handlers for all toolkits
// AST can append additional toolkit layers to this merge call
export const ChatToolkitLive = Layer.mergeAll(
  ThinkToolkitLive,
  DateTimeToolkitLive,
  MathToolkitLive,
  InMemoryToolkitLive,
  PlanToolkitLive,
  WebFetchToolkitLive,
);

export class ChatService extends Context.Service<ChatService>()("ChatService", {
  make: Effect.gen(function* () {
    const toolkit = yield* ChatToolkit;

    const chat = Effect.fn("chat")(function* (history: Array<Prompt.Message>) {
      const queue = yield* Queue.make<typeof ChatStreamPart.Type, Cause.Done>();

      yield* Effect.forkScoped(
        Effect.gen(function* () {
          const systemMessage = String.stripMargin(`
              |You are a helpful general assistant.
              |You have access to tools and should use them when appropriate.
              |Be concise and direct in your responses.
            `);

          const session = yield* Chat.fromPrompt(
            Prompt.make(history).pipe(Prompt.setSystem(systemMessage)),
          );

          yield* runAgenticLoop({
            chat: session,
            queue,
            toolkit,
          });
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              yield* Effect.logError(`Chat error: ${cause}`);
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

export const ChatServiceLive = Layer.effect(ChatService)(ChatService.make).pipe(
  Layer.provide(ChatToolkitLive),
);
