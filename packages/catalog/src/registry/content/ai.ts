// AI package: root module — LanguageModel + MailboxEvents

export const aiIndexContents = `export * from "./LanguageModel";
`;

export const aiLanguageModelContents = `import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Config, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

const AnthropicLive = AnthropicClient.layerConfig({
  apiKey: Config.redacted("ANTHROPIC_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer));

export const SmartModelLive = AnthropicLanguageModel.layer({
  model: "claude-sonnet-4-5",
}).pipe(Layer.provide(AnthropicLive));

export const FastModelLive = AnthropicLanguageModel.layer({
  model: "claude-haiku-4-5",
}).pipe(Layer.provide(AnthropicLive));
`;

// Think Toolkit - minimal required toolkit for ChatService
export const aiThinkToolkitContents = `import { Effect, Schema } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";

/**
 * Think Tool - Allows the AI to reason through complex problems step-by-step.
 * This is a minimal tool that simply returns the thought, enabling the model
 * to "think out loud" without requiring external computation.
 */
const thinkTool = Tool.make("think", {
  description:
    "Use this tool to think through a problem step-by-step before responding. " +
    "Output your reasoning process. This helps with complex tasks that require " +
    "multi-step reasoning. Example: think(thought: 'Let me break this down...')",
  parameters: Schema.Struct({
    thought: Schema.String,
  }),
  success: Schema.String,
});

export const ThinkToolkit = Toolkit.make(thinkTool);

export const ThinkToolkitLive = ThinkToolkit.toLayer(
  Effect.succeed({
    think: (params) =>
      Effect.gen(function* () {
        yield* Effect.logDebug(\`Thinking: \${params.thought}\`);
        return params.thought;
      }),
  }),
);
`;

export const aiChatServiceContents = `import type { ChatStreamPart } from "@repo/domain/Chat";
import { Cause, Context, Effect, Layer, Queue, String } from "effect";
import { Chat, Prompt, Toolkit } from "effect/unstable/ai";
import { ThinkToolkit, ThinkToolkitLive } from "../toolkits/ThinkToolkit";
import { runAgenticLoop } from "../workflow/AgenticLoop";

// ChatToolkit - Merged toolkit for the chat service
// AST can append additional toolkits to this merge call
export const ChatToolkit = Toolkit.merge(ThinkToolkit);

// ChatToolkitLive - Merged layer providing handlers for all toolkits
// AST can append additional toolkit layers to this merge call
export const ChatToolkitLive = Layer.mergeAll(ThinkToolkitLive);

export class ChatService extends Context.Service<ChatService>()("ChatService", {
  make: Effect.gen(function* () {
    const toolkit = yield* ChatToolkit;

    const chat = Effect.fn("chat")(function* (history: Array<Prompt.Message>) {
      const queue = yield* Queue.make<typeof ChatStreamPart.Type, Cause.Done>();

      yield* Effect.forkScoped(
        Effect.gen(function* () {
          const systemMessage = String.stripMargin(\`
              |You are a helpful general assistant.
              |You have access to tools and should use them when appropriate.
              |Be concise and direct in your responses.
            \`);

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
              yield* Effect.logError(\`Chat error: \${cause}\`);
              yield* Queue.offer(queue, {
                _tag: "error",
                message: \`System error: \${Cause.pretty(cause)}\`,
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
`;

export const aiSampleToolkitContents = `import { Data, DateTime, Effect, Schema } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";

class CalculatorError extends Data.TaggedError("CalculatorError")<{
  readonly message: string;
}> {}

/**
 * Calculator Tool - Safely evaluates mathematical expressions
 */
const calculatorTool = Tool.make("calculate", {
  description:
    "Evaluate a mathematical expression safely. Supports basic arithmetic operations (+, -, *, /), exponentiation (^), and common functions (sin, cos, sqrt, etc). Example: calculate(expression: '2 + 2 * 10')",
  parameters: Schema.Struct({
    expression: Schema.String,
  }),
  success: Schema.String,
});

/**
 * Echo Tool - Simple echo for testing
 */
const echoTool = Tool.make("echo", {
  description:
    "Echo back a message. Useful for testing tool calling. Example: echo(message: 'Hello, World!')",
  parameters: Schema.Struct({
    message: Schema.String,
  }),
  success: Schema.String,
});

/**
 * Get Current Time Tool - Returns current UTC time
 */
const getCurrentTimeTool = Tool.make("getCurrentTime", {
  description:
    "Get the current date and time in a given timezone. Example: getCurrentTime(timezone: 'UTC')",
  parameters: Tool.EmptyParams,
  success: Schema.String,
});

export const SampleToolkit = Toolkit.make(
  calculatorTool,
  echoTool,
  getCurrentTimeTool,
);

export const SampleToolkitLive = SampleToolkit.toLayer(
  Effect.gen(function* () {
    return {
      calculate: (params) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(\`Calculating: \${params.expression}\`);

          // Simple safe evaluation for basic math
          // Whitelist allowed characters
          const sanitized = params.expression.replace(/[^0-9+\\-*/().\\s]/g, "");

          if (sanitized !== params.expression) {
            return yield* Effect.succeed(
              \`Error: Expression contains invalid characters. Only numbers and basic operators (+, -, *, /, parentheses) are allowed.\`,
            );
          }

          return yield* Effect.try({
            try: () => {
              const value = Function(\`"use strict"; return (\${sanitized})\`)();
              if (typeof value !== "number" || Number.isNaN(value)) {
                throw new CalculatorError({
                  message: "Result is not a valid number",
                });
              }
              return \`\${params.expression} = \${value}\`;
            },
            catch: (error) =>
              new CalculatorError({
                message: \`Invalid expression: \${error instanceof Error ? error.message : String(error)}\`,
              }),
          }).pipe(
            Effect.catch((error) => Effect.succeed(\`Error: \${error.message}\`)),
          );
        }),

      echo: (params) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(\`Echo: \${params.message}\`);
          return yield* Effect.succeed(\`Echo: \${params.message}\`);
        }),

      getCurrentTime: () =>
        Effect.gen(function* () {
          const now = yield* DateTime.now;
          const timeString = DateTime.formatUtc(now, {
            locale: "en-US",
            dateStyle: "medium",
            timeStyle: "medium",
          });
          yield* Effect.logDebug(\`Current time (UTC): \${timeString}\`);
          return yield* Effect.succeed(
            \`Current time in UTC: \${timeString} (ISO: \${DateTime.formatIso(now)})\`,
          );
        }),
    };
  }),
);
`;

export const aiAgenticLoopContents = `import type { ChatStreamPart } from "@repo/domain/Chat";
import {
  type Cause,
  Effect,
  Inspectable,
  type Queue,
  Ref,
  Schema,
  SchemaGetter,
  Stream,
} from "effect";
import type { Chat, Tool, Toolkit } from "effect/unstable/ai";
import { createMailboxEvents } from "./MailboxEvents";

export const AgenticLoopState = Schema.Struct({
  finishReason: Schema.String,
  iteration: Schema.Number,
});

export const ToolParamsSchema = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Unknown),
);

const stringifyJson = (value: unknown) =>
  Schema.encodeUnknownEffect(
    Schema.String.pipe(
      Schema.decodeTo(Schema.Unknown, {
        decode: SchemaGetter.parseJson<string>({}),
        encode: SchemaGetter.stringifyJson({ space: 2 }),
      }),
    ),
  )(value).pipe(
    Effect.orElseSucceed(() => Inspectable.toStringUnknown(value, 2)),
  );

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
              yield* events.textDelta(part.delta);
              break;

            case "tool-params-start":
              yield* Effect.logInfo(\`Selected tool: \${part.name}\`);

              yield* Ref.update(toolParamsRef, (map) => {
                const newMap = new Map(map);
                newMap.set(part.id, {
                  id: part.id,
                  name: part.name,
                  params: "",
                });
                return newMap;
              });

              yield* events.toolCallStart(part.id, {
                name: part.name,
              });
              break;

            case "tool-params-delta": {
              const toolParamsMap = yield* Ref.get(toolParamsRef);
              const existing = toolParamsMap.get(part.id);

              if (!existing) {
                yield* Effect.logError(
                  \`Received tool-params-delta for unknown tool: \${part.id}\`,
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

              yield* events.toolCallDelta(part.id, {
                argumentsDelta: part.delta,
              });
              break;
            }

            case "tool-params-end": {
              const toolParamsMap = yield* Ref.get(toolParamsRef);
              const toolCall = toolParamsMap.get(part.id);

              if (!toolCall) {
                yield* Effect.logError(
                  \`Received tool-params-end for unknown tool: \${part.id}\`,
                );
                break;
              }

              const parsedParams = yield* Schema.decodeUnknownEffect(
                ToolParamsSchema,
              )(toolCall.params?.trim() || "{}").pipe(
                Effect.tapError((error) =>
                  Effect.logError(
                    \`Failed to parse tool arguments for \${toolCall.name}: \${Inspectable.toStringUnknown(error, 2)}\`,
                  ),
                ),
                Effect.orElseSucceed(() => ({})),
              );

              yield* events.toolCallComplete(toolCall.id, {
                name: toolCall.name,
                arguments: parsedParams,
              });

              yield* events.toolExecutionStart(toolCall.id, {
                name: toolCall.name,
              });
              break;
            }

            case "tool-result": {
              const resultText =
                typeof part.result === "string"
                  ? part.result
                  : yield* stringifyJson(part.result);

              if (part.isFailure) {
                yield* Effect.logError(
                  \`Tool \${part.name}(\${part.id}) failed: \${resultText}\`,
                );
              }

              yield* events.toolExecutionComplete(part.id, {
                name: part.name,
                result: resultText,
                success: !part.isFailure,
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
              yield* events.error(
                typeof part.error === "string"
                  ? part.error
                  : yield* stringifyJson(part.error),
                false,
              );
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

    yield* events.iterationStart(iteration);

    const finishReason = yield* loop({ chat, queue, toolkit });

    yield* Effect.logDebug(
      \`Iteration \${iteration} completed with finishReason: \${finishReason}\`,
    );

    state = { finishReason, iteration };
  }

  const finalState = state;

  if (
    finalState.finishReason === "tool-calls" &&
    finalState.iteration >= maxIterations
  ) {
    yield* events.thinking(
      \`Reached maximum iterations (\${maxIterations}). Stopping here.\`,
    );
  }

  return finalState;
});
`;

export const aiMailboxEventsContents = `import type { ChatStreamPart } from "@repo/domain/Chat";
import { type Cause, Effect, Queue } from "effect";

/**
 * MailboxEvents - Typed event emitter for ChatStreamPart
 * Provides high-level methods for common event patterns to eliminate boilerplate
 */
export const createMailboxEvents = (
  queue: Queue.Queue<typeof ChatStreamPart.Type, Cause.Done>,
) =>
  ({
    thinking: (message: string) =>
      Queue.offer(queue, { _tag: "thinking", message }),
    iterationStart: (iteration: number) =>
      Queue.offer(queue, { _tag: "iteration-start", iteration }),
    iterationEnd: (iteration: number) =>
      Queue.offer(queue, { _tag: "iteration-end", iteration }),
    textDelta: (delta: string) =>
      Queue.offer(queue, { _tag: "text-delta", delta }),
    textComplete: () => Queue.offer(queue, { _tag: "text-complete" }),
    toolCallStart: (
      id: string,
      params: {
        name: string;
        description?: string;
      },
    ) =>
      Queue.offer(queue, {
        _tag: "tool-call-start",
        id,
        name: params.name,
        description: params.description,
      }),
    toolCallDelta: (id: string, params: { argumentsDelta: string }) =>
      Queue.offer(queue, {
        _tag: "tool-call-delta",
        id,
        argumentsDelta: params.argumentsDelta,
      }),
    toolCallComplete: (
      id: string,
      params: {
        name: string;
        arguments: unknown;
      },
    ) =>
      Queue.offer(queue, {
        _tag: "tool-call-complete",
        id,
        name: params.name,
        arguments: params.arguments,
      }),
    toolExecution: (
      id: string,
      params: {
        name: string;
        result: string;
        success: boolean;
      },
    ) =>
      Effect.gen(function* () {
        yield* Queue.offer(queue, {
          _tag: "tool-execution-start",
          id,
          name: params.name,
        });

        yield* Queue.offer(queue, {
          _tag: "tool-execution-complete",
          id,
          name: params.name,
          result: params.result,
          success: params.success,
        });
      }),
    toolExecutionStart: (id: string, params: { name: string }) =>
      Queue.offer(queue, {
        _tag: "tool-execution-start",
        id,
        name: params.name,
      }),
    toolExecutionComplete: (
      id: string,
      params: {
        name: string;
        result: string;
        success: boolean;
      },
    ) =>
      Queue.offer(queue, {
        _tag: "tool-execution-complete",
        id,
        name: params.name,
        result: params.result,
        success: params.success,
      }),
    finish: (
      finishReason: string,
      usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      },
    ) =>
      Queue.offer(queue, {
        _tag: "finish",
        finishReason,
        usage,
      }),
    error: (message: string, recoverable = false) =>
      Queue.offer(queue, { _tag: "error", message, recoverable }),
    end: Queue.end(queue),
  }) as const;
`;
