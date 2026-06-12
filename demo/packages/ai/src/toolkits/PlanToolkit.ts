import {
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
  description: String.stripMargin(`
    |Create an ordered plan for multi-step work. Replaces any existing plan.
    |All steps start as 'pending'.
    `),
  parameters: Schema.Struct({
    steps: Schema.NonEmptyArray(Schema.String),
  }),
  success: PlanResponse,
  failure: Schema.String,
  failureMode: "return",
});

const planUpdateTool = Tool.make("plan_update", {
  description: String.stripMargin(`
    |Update a step's status by 0-based index.
    |Statuses: pending, in_progress, completed, skipped.
    |Only one step may be in_progress; setting a new one auto-completes the prior.
    `),
  parameters: Schema.Struct({
    stepIndex: StepIndex,
    status: PlanStatus,
  }),
  success: PlanResponse,
  failure: Schema.String,
  failureMode: "return",
});

const planGetTool = Tool.make("plan_get", {
  description: String.stripMargin(`
    |Retrieve the current plan and step statuses.
    `),
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
          yield* Effect.logDebug(`Plan created with ${steps.length} steps`);
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
                  `Invalid step index ${params.stepIndex}. Plan has ${steps.length} steps (0-${steps.length - 1}).`,
                ),
              onSome: Effect.succeed,
            }),
          );

          yield* Ref.set(planRef, updated);
          yield* Effect.logDebug(
            `Plan step ${params.stepIndex} -> ${params.status}`,
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
