import type { ChatStreamPart } from "@repo/domain/Chat";
import {
  type Cause,
  Context,
  Effect,
  Layer,
  type Queue,
  Schema,
  Stream,
} from "effect";
import type {
  Chat,
  LanguageModel,
  Tool,
  Toolkit,
} from "effect/unstable/ai";
import { createMailboxEvents } from "./MailboxEvents";

export const AgenticLoopState = Schema.Struct({
  finishReason: Schema.String,
  iteration: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

type LoopState = typeof AgenticLoopState.Type;

type LoopError<Tools extends Record<string, Tool.Any>> =
  LanguageModel.ExtractError<{ toolkit: Toolkit.WithHandler<Tools> }>;

type LoopRequirements<Tools extends Record<string, Tool.Any>> =
  | LanguageModel.LanguageModel
  | LanguageModel.ExtractServices<{ toolkit: Toolkit.WithHandler<Tools> }>;

type ToolParams = {
  id: string;
  name: string;
  params: string;
};

type TurnState = {
  finishReason: string;
  toolResults: number;
  toolParams: Map<string, ToolParams>;
};

const upsertToolParams = (
  state: TurnState,
  id: string,
  update: (current: ToolParams | undefined) => ToolParams | undefined,
) => {
  const toolParams = new Map(state.toolParams);
  const next = update(toolParams.get(id));

  if (next === undefined) {
    toolParams.delete(id);
  } else {
    toolParams.set(id, next);
  }

  return { ...state, toolParams };
};

export type AgenticLoopRunOptions<Tools extends Record<string, Tool.Any>> = {
  chat: Chat.Chat;
  queue: Queue.Queue<ChatStreamPart, Cause.Done>;
  toolkit: Toolkit.WithHandler<Tools>;
  maxIterations?: number;
};

const runTurn = <Tools extends Record<string, Tool.Any>>({
  chat,
  queue,
  toolkit,
}: {
  chat: Chat.Chat;
  queue: Queue.Queue<ChatStreamPart, Cause.Done>;
  toolkit: Toolkit.WithHandler<Tools>;
}) =>
  Effect.gen(function* () {
    const events = createMailboxEvents(queue);

    const state = yield* chat
      .streamText({
        prompt: [],
        toolkit,
      })
      .pipe(
        Stream.runFoldEffect(
          () =>
            ({
              finishReason: "stop",
              toolResults: 0,
              toolParams: new Map(),
            }) satisfies TurnState,
          (state, part) =>
            Effect.gen(function* () {
              switch (part.type) {
                case "text-delta":
                  yield* events.text(part.delta);
                  return state;

                case "tool-params-start":
                  yield* Effect.logInfo(`Selected tool: ${part.name}`);
                  return upsertToolParams(state, part.id, () => ({
                    id: part.id,
                    name: part.name,
                    params: "",
                  }));

                case "tool-params-delta":
                  if (!state.toolParams.has(part.id)) {
                    yield* Effect.logError(
                      `Received tool-params-delta for unknown tool: ${part.id}`,
                    );
                    return state;
                  }

                  return upsertToolParams(state, part.id, (current) =>
                    current === undefined
                      ? undefined
                      : {
                          ...current,
                          params: current.params + part.delta,
                        },
                  );

                case "tool-params-end": {
                  const toolCall = state.toolParams.get(part.id);

                  if (toolCall === undefined) {
                    yield* Effect.logError(
                      `Received tool-params-end for unknown tool: ${part.id}`,
                    );
                    return state;
                  }

                  yield* events.toolStart(toolCall);

                  return upsertToolParams(state, part.id, () => undefined);
                }

                case "tool-call": {
                  yield* events.toolStart(part);

                  return upsertToolParams(state, part.id, () => ({
                    id: part.id,
                    name: part.name,
                    params: "",
                  }));
                }

                case "tool-result": {
                  if (part.isFailure) {
                    yield* Effect.logError(
                      `Tool ${part.name}(${part.id}) failed`,
                    );
                  }

                  yield* events.toolResult(part);
                  return {
                    ...state,
                    toolResults: state.toolResults + 1,
                  };
                }

                case "finish":
                  if (part.reason !== "tool-calls") {
                    const promptTokens = part.usage.inputTokens.total ?? 0;
                    const completionTokens = part.usage.outputTokens.total ?? 0;
                    yield* events.finish(part.reason, {
                      promptTokens,
                      completionTokens,
                      totalTokens: promptTokens + completionTokens,
                    });
                  }
                  return { ...state, finishReason: part.reason };

                case "error":
                  yield* events.unknownError(part.error);
                  return state;

                default:
                  return state;
              }
            }),
        ),
      );

    return state.finishReason;
  });

export class AgenticLoopService extends Context.Service<AgenticLoopService>()(
  "AgenticLoopService",
  {
    make: Effect.succeed({
      run: Effect.fnUntraced(function* <
        Tools extends Record<string, Tool.Any>,
      >({
        chat,
        queue,
        toolkit,
        maxIterations = 12,
      }: AgenticLoopRunOptions<Tools>) {
        const events = createMailboxEvents(queue);

        const runNextTurn: (
          state: LoopState,
        ) => Effect.Effect<
          LoopState,
          LoopError<Tools>,
          LoopRequirements<Tools>
        > = (state: LoopState) =>
          Effect.suspend(() =>
            Effect.gen(function* () {
              if (
                state.finishReason !== "tool-calls" ||
                state.iteration >= maxIterations
              ) {
                return state;
              }

              const iteration = state.iteration + 1;
              const finishReason = yield* runTurn({
                chat,
                queue,
                toolkit,
              }).pipe(
                Effect.withSpan("AgenticLoop.turn", {
                  attributes: {
                    "agentic.iteration": iteration,
                    "agentic.maxIterations": maxIterations,
                  },
                }),
              );

              yield* Effect.logDebug(
                `Iteration ${iteration} completed with finishReason: ${finishReason}`,
              );

              return yield* runNextTurn({ finishReason, iteration });
            }),
          );

        const finalState = yield* runNextTurn({
          finishReason: "tool-calls",
          iteration: 0,
        });

        if (
          finalState.finishReason === "tool-calls" &&
          finalState.iteration >= maxIterations
        ) {
          yield* events.reasoning(
            `Reached maximum iterations (${maxIterations}). Stopping here.`,
          );
        }

        return finalState;
      }, Effect.withSpan("AgenticLoop.run")),
    }),
  },
) {
  static layer = Layer.effect(AgenticLoopService)(AgenticLoopService.make);
}

export const AgenticLoopServiceLive = AgenticLoopService.layer;
