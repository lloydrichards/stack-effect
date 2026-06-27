import type { ChatStreamPart } from "@repo/domain/Chat";
import {
  type Cause,
  Effect,
  Inspectable,
  type Queue,
  Ref,
  Schema,
  Stream,
} from "effect";
import type { Chat, Tool, Toolkit } from "effect/unstable/ai";
import { createMailboxEvents } from "./MailboxEvents";

export const AgenticLoopState = Schema.Struct({
  finishReason: Schema.String,
  iteration: Schema.Number,
});

const stringifyJson = (value: unknown) =>
  Effect.try({
    try: (): string =>
      JSON.stringify(value, null, 2) ?? Inspectable.toStringUnknown(value, 2),
    catch: () => new Error("Failed to stringify JSON"),
  }).pipe(Effect.orElseSucceed(() => Inspectable.toStringUnknown(value, 2)));

const loop = Effect.fn("loop")(function* <
  Tools extends Record<string, Tool.Any>,
>({
  chat,
  queue,
  toolkit,
}: {
  chat: Chat.Service;
  queue: Queue.Queue<typeof ChatStreamPart.Type, Cause.Done>;
  toolkit: Toolkit.WithHandler<Tools>;
}) {
  const events = createMailboxEvents(queue);
  const finishReasonRef = yield* Ref.make("stop");
  const toolParamsRef = yield* Ref.make(
    new Map<
      string,
      {
        id: string;
        name: string;
        params: string;
      }
    >(),
  );

  yield* chat
    .streamText({
      prompt: [],
      toolkit,
    })
    .pipe(
      Stream.runForEach((part) =>
        Effect.gen(function* () {
          switch (part.type) {
            case "text-delta":
              yield* events.text(part.delta);
              break;

            case "tool-params-start":
              yield* Effect.logInfo(`Selected tool: ${part.name}`);

              yield* Ref.update(toolParamsRef, (map) => {
                const newMap = new Map(map);
                newMap.set(part.id, {
                  id: part.id,
                  name: part.name,
                  params: "",
                });
                return newMap;
              });

              break;

            case "tool-params-delta": {
              const toolParamsMap = yield* Ref.get(toolParamsRef);
              const existing = toolParamsMap.get(part.id);

              if (!existing) {
                yield* Effect.logError(
                  `Received tool-params-delta for unknown tool: ${part.id}`,
                );
                break;
              }

              yield* Ref.update(toolParamsRef, (map) => {
                const newMap = new Map(map);
                newMap.set(part.id, {
                  ...existing,
                  params: existing.params + part.delta,
                });
                return newMap;
              });

              break;
            }

            case "tool-params-end": {
              const toolParamsMap = yield* Ref.get(toolParamsRef);
              const toolCall = toolParamsMap.get(part.id);

              if (!toolCall) {
                yield* Effect.logError(
                  `Received tool-params-end for unknown tool: ${part.id}`,
                );
                break;
              }

              const input = toolCall.params.trim();

              yield* events.toolStart(
                toolCall.id,
                input === ""
                  ? { name: toolCall.name }
                  : { name: toolCall.name, input },
              );
              break;
            }

            case "tool-result": {
              const resultTextEffect =
                typeof part.result === "string"
                  ? Effect.succeed(part.result)
                  : stringifyJson(part.result);
              const resultText = yield* resultTextEffect;

              if (part.isFailure) {
                yield* Effect.logError(
                  `Tool ${part.name}(${part.id}) failed: ${resultText}`,
                );
              }

              if (part.isFailure) {
                yield* events.toolFailure(part.id, {
                  name: part.name,
                  error: resultText,
                });
                break;
              }

              yield* events.toolSuccess(part.id, {
                name: part.name,
                output: resultText,
              });
              break;
            }

            case "finish":
              yield* Ref.set(finishReasonRef, part.reason);
              if (part.reason !== "tool-calls") {
                yield* events.finish(part.reason, {
                  promptTokens: part.usage.inputTokens.total ?? 0,
                  completionTokens: part.usage.outputTokens.total ?? 0,
                  totalTokens:
                    (part.usage.inputTokens.total ?? 0) +
                    (part.usage.outputTokens.total ?? 0),
                });
              }
              break;

            case "error":
              if (typeof part.error === "string") {
                yield* events.error(part.error, false);
                break;
              }

              yield* events.error(yield* stringifyJson(part.error), false);
              break;

            default:
              break;
          }
        }),
      ),
    );

  return yield* Ref.get(finishReasonRef);
});

export const runAgenticLoop = Effect.fn("runAgenticLoop")(function* <
  Tools extends Record<string, Tool.Any>,
>({
  chat,
  queue,
  toolkit,
  maxIterations = 12,
}: {
  chat: Chat.Service;
  queue: Queue.Queue<typeof ChatStreamPart.Type, Cause.Done>;
  toolkit: Toolkit.WithHandler<Tools>;
  maxIterations?: number;
}) {
  const events = createMailboxEvents(queue);

  let state = { finishReason: "tool-calls", iteration: 0 };

  while (
    state.finishReason === "tool-calls" &&
    state.iteration < maxIterations
  ) {
    const iteration = state.iteration + 1;

    const finishReason = yield* loop({ chat, queue, toolkit });

    yield* Effect.logDebug(
      `Iteration ${iteration} completed with finishReason: ${finishReason}`,
    );

    state = { finishReason, iteration };
  }

  const finalState = state;

  if (
    finalState.finishReason === "tool-calls" &&
    finalState.iteration >= maxIterations
  ) {
    yield* events.reasoning(
      `Reached maximum iterations (${maxIterations}). Stopping here.`,
    );
  }

  return finalState;
});
