// AI package: root module — LanguageModel + MailboxEvents

export const aiIndexContents = `export * from "./LanguageModel";
`;

export const aiLanguageModelContents = `import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Config, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

const AnthropicLive = AnthropicClient.layerConfig({
  apiKey: Config.redacted("ANTHROPIC_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer));

export const SmartModelLive = AnthropicLanguageModel.model(
  "claude-sonnet-4-5",
).pipe(Layer.provide(AnthropicLive));

export const FastModelLive = AnthropicLanguageModel.model(
  "claude-haiku-4-5",
).pipe(Layer.provide(AnthropicLive));
`;

// Think Toolkit - minimal required toolkit for AiChatService
export const aiThinkToolkitContents = `import { Effect, Schema, String } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";

const thinkTool = Tool.make("think", {
  description: String.stripMargin(\`
    |Use when facing ambiguous or multi-step problems where reasoning before
    |acting will improve accuracy. The thought is recorded but not shown to
    |the user.\`),
  parameters: Schema.Struct({
    thought: Schema.String,
  }),
  success: Schema.String,
});

/**
 * Allows the model to reason through complex problems step-by-step.
 * Returns the thought as-is, enabling "thinking out loud" without
 * affecting the external state.
 *
 * @module
 */
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
import { Cause, Context, Effect, Layer, Option, Queue, String } from "effect";
import { Chat, Prompt, Toolkit } from "effect/unstable/ai";
import { ThinkToolkit, ThinkToolkitLive } from "../toolkits/ThinkToolkit";
import {
  AgenticLoopService,
  AgenticLoopServiceLive,
} from "../workflow/AgenticLoop";

// ChatToolkit - Merged toolkit for the chat service
// AST can append additional toolkits to this merge call
export const ChatToolkit = Toolkit.merge(ThinkToolkit);

// ChatToolkitLive - Merged layer providing handlers for all toolkits
// AST can append additional toolkit layers to this merge call
export const ChatToolkitLive = Layer.mergeAll(ThinkToolkitLive);

export class AiChatService extends Context.Service<AiChatService>()("AiChatService", {
  make: Effect.gen(function* () {
    const toolkit = yield* ChatToolkit;
    const loop = yield* AgenticLoopService;

    const chat = Effect.fn("chat")(function* (history: Array<Prompt.Message>) {
      const queue = yield* Queue.make<typeof ChatStreamPart.Type, Cause.Done>();
      const currentSpan = yield* Effect.currentSpan.pipe(Effect.option);
      const currentParentSpan = yield* Effect.currentParentSpan.pipe(
        Effect.option,
      );
      const generationParentSpan = Option.flatMap(
        currentSpan,
        (span) => span.parent,
      ).pipe(Option.orElse(() => currentParentSpan));

      const runGeneration = Effect.gen(function* () {
        const systemMessage = String.stripMargin(\`
              |You are a helpful general assistant.
              |You have access to tools and should use them when appropriate.
              |Be concise and direct in your responses.
            \`);

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

export const AiChatServiceLive = Layer.effect(AiChatService)(AiChatService.make).pipe(
  Layer.provide(ChatToolkitLive),
  Layer.provide(AgenticLoopServiceLive),
);
`;

// DateTime Toolkit - timezone-aware date/time for agents
export const aiDateTimeToolkitContents = `import { DateTime, Effect, Option, Schema, String } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";

const getCurrentDatetimeTool = Tool.make("get_current_datetime", {
  description: String.stripMargin(\`
    |Get the current date and time in a specified timezone.
    |Use IANA timezone identifiers (e.g. 'America/New_York', 'Europe/London', 'UTC').
  \`),
  parameters: Schema.Struct({
    timezone: Schema.String,
  }),
  success: Schema.Struct({
    iso: Schema.DateTimeUtc,
    formatted: Schema.String,
    timezone: Schema.String,
    unix: Schema.Number,
  }),
  failure: Schema.String,
  failureMode: "return",
});

/**
 * Provides the current date and time in a specified timezone.
 * Models have no access to real-time clocks, making this essential
 * for any time-aware agent behavior.
 *
 * @module
 */
export const DateTimeToolkit = Toolkit.make(getCurrentDatetimeTool);

export const DateTimeToolkitLive = DateTimeToolkit.toLayer(
  Effect.succeed({
    get_current_datetime: (params) =>
      Effect.gen(function* () {
        const tz = params.timezone || "UTC";
        const now = yield* DateTime.now;
        const zoned = yield* Option.match(DateTime.setZoneNamed(now, tz), {
          onNone: () =>
            Effect.fail(\`Invalid timezone "\${tz}": not a valid IANA timezone\`),
          onSome: Effect.succeed,
        });

        yield* Effect.logDebug(\`Getting current datetime for timezone: \${tz}\`);

        return {
          iso: now,
          formatted: DateTime.format(zoned, {
            dateStyle: "full",
            timeStyle: "long",
          }),
          timezone: tz,
          unix: DateTime.toEpochMillis(now),
        };
      }),
  }),
);
`;

// Math Toolkit - deterministic arithmetic evaluation
export const aiMathToolkitContents = `import { Effect, pipe, Schema, String } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";

const SAFE_EXPRESSION_PATTERN = /^[\\d\\s+\\-*/().,%^e]+$/;

const MathExpression = Schema.String.check(
  Schema.isNonEmpty({ message: "Expression cannot be empty" }),
  Schema.isTrimmed({
    message: "Expression must not have leading/trailing whitespace",
  }),
  Schema.isPattern(SAFE_EXPRESSION_PATTERN, {
    description: String.stripMargin(\`
      |Only digits, arithmetic operators (+, -, *, /, %, ^), 
      |parentheses, and decimal points are allowed
    \`),
  }),
).annotate({
  title: "MathExpression",
  description: String.stripMargin(\`
    |An arithmetic expression using numbers and operators.
    |Supports: +, -, *, /, % (modulo), ^ or ** (exponent), parentheses.
  \`),
  examples: ["(42 * 3.14) / 7", "2 ^ 10", "100 % 7", "3.14 * (2 + 1)"],
});

const calculateTool = Tool.make("calculate", {
  description: String.stripMargin(\`
    |Evaluate an arithmetic expression deterministically. Use instead of
    |mental math. Supports: +, -, *, /, % (modulo), ** (exponent), parentheses.
  \`),
  parameters: Schema.Struct({
    expression: MathExpression,
  }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

const normalize = String.replaceAll("^", "**");

const evaluate = (expr: string, original: string) =>
  pipe(
    Effect.try({
      try: () => new Function(\`return (\${expr})\`)() as unknown,
      catch: (cause) =>
        \`Failed to evaluate expression '\${original}': \${cause instanceof Error ? cause.message : globalThis.String(cause)}\`,
    }),
    Effect.filterOrFail(
      (result): result is number =>
        typeof result === "number" && Number.isFinite(result),
      (result) =>
        \`Expression did not produce a finite number: '\${original}' = \${globalThis.String(result)}\`,
    ),
  );

/**
 * Evaluates arithmetic expressions deterministically.
 * Models are unreliable at mental math; this offloads computation
 * to a safe evaluator restricted to numeric operators.
 *
 * @module
 */
export const MathToolkit = Toolkit.make(calculateTool);

export const MathToolkitLive = MathToolkit.toLayer(
  Effect.succeed({
    calculate: (params) =>
      Effect.gen(function* () {
        const expr = params.expression;
        const normalized = normalize(expr);
        const result = yield* evaluate(normalized, expr);

        yield* Effect.logDebug(\`Calculate: \${expr} = \${result}\`);
        return globalThis.String(result);
      }),
  }),
);
`;

// Memory Toolkit - key-value scratchpad for agentic sessions
export const aiMemoryToolkitContents = `import {
  Array as Arr,
  Effect,
  HashMap,
  Option,
  Ref,
  Schema,
  String,
} from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";

const memorySetTool = Tool.make("memory_set", {
  description: String.stripMargin(\`
    |Store a key-value pair in session memory. Overwrites existing keys.
    \`),
  parameters: Schema.Struct({
    key: Schema.String,
    value: Schema.String,
  }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

const memoryGetTool = Tool.make("memory_get", {
  description: String.stripMargin(\`
    |Retrieve a value by key from session memory.
    \`),
  parameters: Schema.Struct({
    key: Schema.String,
  }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

const memoryListTool = Tool.make("memory_list", {
  description: String.stripMargin(\`
    |List all keys in session memory.
    \`),
  parameters: Tool.EmptyParams,
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

const memoryDeleteTool = Tool.make("memory_delete", {
  description: String.stripMargin(\`
    |Remove a key from session memory.
    \`),
  parameters: Schema.Struct({
    key: Schema.String,
  }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

/**
 * Key-value scratchpad for agentic loops. Allows the model to persist
 * and retrieve facts across tool invocations within a single session.
 *
 * @module
 */
export const MemoryToolkit = Toolkit.make(
  memorySetTool,
  memoryGetTool,
  memoryListTool,
  memoryDeleteTool,
);

/** Backed by an in-memory HashMap Ref scoped to the layer lifetime. */
export const InMemoryToolkitLive = MemoryToolkit.toLayer(
  Effect.gen(function* () {
    const store = yield* Ref.make(HashMap.empty<string, string>());

    return {
      memory_set: (params) =>
        Ref.update(store, HashMap.set(params.key, params.value)).pipe(
          Effect.tap(() => Effect.logDebug(\`Memory set: \${params.key}\`)),
          Effect.map(() => \`Stored "\${params.key}"\`),
        ),

      memory_get: (params) =>
        Ref.get(store).pipe(
          Effect.map((map) => HashMap.get(map, params.key)),
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(\`Key "\${params.key}" not found in memory\`),
              onSome: Effect.succeed,
            }),
          ),
          Effect.tap(() => Effect.logDebug(\`Memory get: \${params.key}\`)),
        ),

      memory_list: () =>
        Ref.get(store).pipe(
          Effect.map((map) => Arr.fromIterable(HashMap.keys(map))),
          Effect.tap((keys) =>
            Effect.logDebug(\`Memory list: \${keys.length} keys\`),
          ),
          Effect.map(JSON.stringify),
        ),

      memory_delete: (params) =>
        Ref.modify(store, (map) =>
          HashMap.has(map, params.key)
            ? ([true, HashMap.remove(map, params.key)] as const)
            : ([false, map] as const),
        ).pipe(
          Effect.flatMap((deleted) =>
            deleted
              ? Effect.succeed(\`Deleted "\${params.key}"\`)
              : Effect.fail(\`Key "\${params.key}" not found in memory\`),
          ),
          Effect.tap(() => Effect.logDebug(\`Memory delete: \${params.key}\`)),
        ),
    };
  }),
);
`;

// Plan Toolkit - structured task tracking for agentic loops
export const aiPlanToolkitContents = `import {
  Array as Arr,
  Effect,
  Option,
  pipe,
  Ref,
  Schema,
  String,
} from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";

const PlanStatus = Schema.Literals([
  "pending",
  "in_progress",
  "completed",
  "skipped",
] as const);

const PlanStep = Schema.Struct({
  content: Schema.String,
  status: PlanStatus,
});
type PlanStep = typeof PlanStep.Type;

const StepIndex = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const PlanResponse = Schema.Struct({
  steps: Schema.Array(
    Schema.Struct({
      index: StepIndex,
      content: Schema.String,
      status: PlanStatus,
    }),
  ),
});
type PlanResponse = typeof PlanResponse.Type;

const planCreateTool = Tool.make("plan_create", {
  description: String.stripMargin(\`
    |Create an ordered plan for multi-step work. Replaces any existing plan.
    |All steps start as 'pending'.
    \`),
  parameters: Schema.Struct({
    steps: Schema.NonEmptyArray(Schema.String),
  }),
  success: PlanResponse,
  failure: Schema.String,
  failureMode: "return",
});

const planUpdateTool = Tool.make("plan_update", {
  description: String.stripMargin(\`
    |Update a step's status by 0-based index.
    |Statuses: pending, in_progress, completed, skipped.
    |Only one step may be in_progress; setting a new one auto-completes the prior.
    \`),
  parameters: Schema.Struct({
    stepIndex: StepIndex,
    status: PlanStatus,
  }),
  success: PlanResponse,
  failure: Schema.String,
  failureMode: "return",
});

const planGetTool = Tool.make("plan_get", {
  description: String.stripMargin(\`
    |Retrieve the current plan and step statuses.
    \`),
  parameters: Tool.EmptyParams,
  success: Schema.Union([
    PlanResponse,
    Schema.Struct({ message: Schema.String }),
  ]),
  failure: Schema.String,
  failureMode: "return",
});

/**
 * Structured task tracking for agentic loops. Forces the model to plan
 * before acting and track progress through steps. Enforces at most one
 * step in_progress at a time.
 *
 * @module
 */
export const PlanToolkit = Toolkit.make(
  planCreateTool,
  planUpdateTool,
  planGetTool,
);

const formatPlan = (steps: Array<PlanStep>): PlanResponse => ({
  steps: Arr.map(steps, (step, index) => ({ index, ...step })),
});

export const PlanToolkitLive = PlanToolkit.toLayer(
  Effect.gen(function* () {
    const planRef = yield* Ref.make<Array<PlanStep>>([]);

    return {
      plan_create: (params) =>
        Effect.gen(function* () {
          const steps: Array<PlanStep> = Arr.map(params.steps, (content) => ({
            content,
            status: "pending" as const,
          }));

          yield* Ref.set(planRef, steps);
          yield* Effect.logDebug(\`Plan created with \${steps.length} steps\`);
          return formatPlan(steps);
        }),

      plan_update: (params) =>
        Effect.gen(function* () {
          const steps = yield* Ref.get(planRef);

          if (Arr.isArrayEmpty(steps)) {
            return yield* Effect.fail("No plan exists. Use plan_create first.");
          }

          const updated = yield* pipe(
            params.status === "in_progress"
              ? Option.some(
                  Arr.map(steps, (step, i): PlanStep => {
                    if (i === params.stepIndex)
                      return { ...step, status: "in_progress" };
                    if (step.status === "in_progress")
                      return { ...step, status: "completed" };
                    return step;
                  }),
                )
              : Arr.modify(steps, params.stepIndex, (step) => ({
                  ...step,
                  status: params.status,
                })),
            Option.match({
              onNone: () =>
                Effect.fail(
                  \`Invalid step index \${params.stepIndex}. Plan has \${steps.length} steps (0-\${steps.length - 1}).\`,
                ),
              onSome: Effect.succeed,
            }),
          );

          yield* Ref.set(planRef, updated);
          yield* Effect.logDebug(
            \`Plan step \${params.stepIndex} -> \${params.status}\`,
          );
          return formatPlan(updated);
        }),

      plan_get: () =>
        Ref.get(planRef).pipe(
          Effect.map((steps) =>
            Arr.isArrayEmpty(steps)
              ? { message: "No plan exists. Use plan_create to create one." }
              : formatPlan(steps),
          ),
        ),
    };
  }),
);
`;

// WebFetch Toolkit - URL retrieval for retrieval-augmented workflows
export const aiWebFetchToolkitContents = `import { Effect, Layer, Match, pipe, Schema, String } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
} from "effect/unstable/http";

const MAX_CONTENT_LENGTH = 8000;

const HTML_ENTITIES: ReadonlyArray<readonly [string, string]> = [
  ["&nbsp;", " "],
  ["&amp;", "&"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&#039;", "'"],
];

const stripHtml = (html: string): string =>
  pipe(
    html,
    String.replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi, ""),
    String.replace(/<style[^>]*>[\\s\\S]*?<\\/style>/gi, ""),
    String.replace(/<[^>]+>/g, " "),
    (s) =>
      HTML_ENTITIES.reduce(
        (acc, [entity, char]) => acc.replaceAll(entity, char),
        s,
      ),
    String.replace(/\\s+/g, " "),
    String.trim,
  );

const truncate = (text: string): string =>
  String.length(text) > MAX_CONTENT_LENGTH
    ? \`\${pipe(text, String.takeLeft(MAX_CONTENT_LENGTH))}...[truncated]\`
    : text;

const fetchUrlTool = Tool.make("fetch_url", {
  description: String.stripMargin(\`
    |Fetch a URL and return its content as plain text.
    |HTML is stripped automatically. Output truncated at 8000 characters.
  \`),
  parameters: Schema.Struct({ url: Schema.URLFromString }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

/**
 * Retrieves content from URLs for retrieval-augmented workflows.
 * HTML is stripped automatically and output is truncated at 8000 characters.
 *
 * @module
 */
export const WebFetchToolkit = Toolkit.make(fetchUrlTool);

/** Provides its own HTTP client for network access. */
export const WebFetchToolkitLive = WebFetchToolkit.toLayer(
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const http = client.pipe(
      HttpClient.followRedirects(10),
      HttpClient.retryTransient({ times: 2 }),
    );

    return {
      fetch_url: (params) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(\`Fetching URL: \${params.url}\`);

          const response = yield* pipe(
            http.get(params.url),
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.mapError((error) =>
              Match.value(error.reason).pipe(
                Match.tag(
                  "TransportError",
                  () =>
                    \`Network error fetching "\${params.url}": connection failed or timed out\`,
                ),
                Match.tag(
                  "InvalidUrlError",
                  () => \`Invalid URL: "\${params.url}"\`,
                ),
                Match.tag(
                  "StatusCodeError",
                  (r) =>
                    \`HTTP \${globalThis.String(r.response.status)} from "\${params.url}"\`,
                ),
                Match.orElse(
                  () => \`Failed to fetch "\${params.url}": \${error.message}\`,
                ),
              ),
            ),
          );

          const raw = yield* pipe(
            response.text,
            Effect.mapError(
              () => \`Failed to read response body from "\${params.url}"\`,
            ),
          );
          const contentType = String.toLowerCase(
            response.headers["content-type"] ?? "",
          );
          const text = Match.value(contentType).pipe(
            Match.when(String.includes("text/html"), () => stripHtml(raw)),
            Match.orElse(() => raw),
          );

          const result = truncate(text);

          yield* Effect.logDebug(
            \`Fetched \${String.String(String.length(text))} chars from \${params.url} (returned \${String.String(String.length(result))})\`,
          );

          return result;
        }),
    };
  }),
).pipe(Layer.provide(FetchHttpClient.layer));
`;

export const aiAgenticLoopContents = `import type { ChatStreamPart } from "@repo/domain/Chat";
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
  AiError,
  Chat,
  LanguageModel,
  Tool,
  Toolkit,
} from "effect/unstable/ai";
import { createMailboxEvents } from "./MailboxEvents";

export const AgenticLoopState = Schema.Struct({
  finishReason: Schema.String,
  iteration: Schema.Number,
});

type LoopState = typeof AgenticLoopState.Type;

type LoopError<Tools extends Record<string, Tool.Any>> =
  | AiError.AiError
  | Tool.HandlerError<Tools[keyof Tools]>;

type LoopRequirements<Tools extends Record<string, Tool.Any>> =
  | LanguageModel.LanguageModel
  | Tool.HandlerServices<Tools[keyof Tools]>
  | Tool.ResultDecodingServices<Tools[keyof Tools]>;

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
  chat: Chat.Service;
  queue: Queue.Queue<typeof ChatStreamPart.Type, Cause.Done>;
  toolkit: Toolkit.WithHandler<Tools>;
  maxIterations?: number;
};

const runTurn = <Tools extends Record<string, Tool.Any>>({
  chat,
  queue,
  toolkit,
}: {
  chat: Chat.Service;
  queue: Queue.Queue<typeof ChatStreamPart.Type, Cause.Done>;
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
                  yield* Effect.logInfo(\`Selected tool: \${part.name}\`);
                  return upsertToolParams(state, part.id, () => ({
                    id: part.id,
                    name: part.name,
                    params: "",
                  }));

                case "tool-params-delta":
                  if (!state.toolParams.has(part.id)) {
                    yield* Effect.logError(
                      \`Received tool-params-delta for unknown tool: \${part.id}\`,
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
                      \`Received tool-params-end for unknown tool: \${part.id}\`,
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
                      \`Tool \${part.name}(\${part.id}) failed\`,
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
                \`Iteration \${iteration} completed with finishReason: \${finishReason}\`,
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
            \`Reached maximum iterations (\${maxIterations}). Stopping here.\`,
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
`;

export const aiMailboxEventsContents = `import { ChatStreamPart } from "@repo/domain/Chat";
import {
  type Cause,
  Effect,
  Inspectable,
  Queue,
  Schema,
  SchemaGetter,
  String,
} from "effect";

const JsonString = Schema.String.pipe(
  Schema.decodeTo(Schema.Unknown, {
    decode: SchemaGetter.parseJson<string>({}),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const stringifyJson = (value: unknown) =>
  Schema.encodeUnknownEffect(JsonString)(value).pipe(
    Effect.orElseSucceed(() => Inspectable.toStringUnknown(value, 2)),
  );

const stringifyValue = (value: unknown) =>
  typeof value === "string" ? Effect.succeed(value) : stringifyJson(value);

const optionalNonEmpty = (value: string | undefined) => {
  if (value === undefined) {
    return {};
  }

  const input = String.trim(value);
  return String.isEmpty(input) ? {} : { input };
};

type ToolStart = {
  id: string;
  name: string;
  input?: string;
  params?: unknown;
};

type ToolResult = {
  id: string;
  name: string;
  result: unknown;
  isFailure: boolean;
};

const toolStartInput = (part: ToolStart) => {
  if (part.input !== undefined) {
    return Effect.succeed(part.input);
  }

  if (part.params === undefined) {
    return Effect.succeed(undefined);
  }

  return stringifyValue(part.params);
};

/**
 * MailboxEvents - Typed event emitter for ChatStreamPart
 * Provides high-level methods for common event patterns to eliminate boilerplate
 */
export const createMailboxEvents = (
  queue: Queue.Queue<typeof ChatStreamPart.Type, Cause.Done>,
) =>
  ({
    text: (delta: string) =>
      Queue.offer(queue, ChatStreamPart.cases.text.make({ delta })),
    reasoning: (delta: string) =>
      Queue.offer(queue, ChatStreamPart.cases.reasoning.make({ delta })),
    toolStart: (part: ToolStart) =>
      Effect.gen(function* () {
        const input = yield* toolStartInput(part);

        yield* Queue.offer(
          queue,
          ChatStreamPart.cases["tool-start"].make({
            id: part.id,
            name: part.name,
            ...optionalNonEmpty(input),
          }),
        );
      }),
    toolResult: (part: ToolResult) =>
      Effect.gen(function* () {
        const result = yield* stringifyValue(part.result);

        if (part.isFailure) {
          yield* Queue.offer(
            queue,
            ChatStreamPart.cases["tool-failure"].make({
              id: part.id,
              name: part.name,
              error: result,
            }),
          );
          return;
        }

        yield* Queue.offer(
          queue,
          ChatStreamPart.cases["tool-success"].make({
            id: part.id,
            name: part.name,
            output: result,
          }),
        );
      }),
    toolSuccess: (id: string, params: { name: string; output: string }) =>
      Queue.offer(
        queue,
        ChatStreamPart.cases["tool-success"].make({
          id,
          name: params.name,
          output: params.output,
        }),
      ),
    toolFailure: (id: string, params: { name: string; error: string }) =>
      Queue.offer(
        queue,
        ChatStreamPart.cases["tool-failure"].make({
          id,
          name: params.name,
          error: params.error,
        }),
      ),
    finish: (
      reason: string,
      usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      },
    ) =>
      Queue.offer(
        queue,
        ChatStreamPart.cases.finish.make({
          reason,
          ...(usage === undefined ? {} : { usage }),
        }),
      ),
    error: (message: string, recoverable = false) =>
      Queue.offer(
        queue,
        ChatStreamPart.cases.error.make({ message, recoverable }),
      ),
    unknownError: (error: unknown, recoverable = false) =>
      Effect.gen(function* () {
        const message =
          typeof error === "string" ? error : yield* stringifyValue(error);

        yield* Queue.offer(
          queue,
          ChatStreamPart.cases.error.make({ message, recoverable }),
        );
      }),
    end: Queue.end(queue),
  }) as const;
`;
