import assert from "node:assert/strict";
import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { type Apply, ApplyResult } from "@repo/domain/Apply";
import { Blueprint } from "@repo/domain/Blueprint";
import { Plan } from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import {
  ApplyService,
  BlueprintService,
  FinalizeService,
  PlanService,
  ScaffoldFormatter,
} from "@repo/scaffold";
import { Cause, Effect, Exit, Layer, Result, Stream } from "effect";
import { Box } from "effect-boxes";
import { FinalizeScriptFailure, ScaffoldPipeline } from "./ScaffoldPipeline";

const blueprint = new Blueprint({ nodes: [], edges: [] });
const plan = new Plan({ outcomes: [], conflicts: [] });
const conflictPlan = new Plan({
  outcomes: [
    {
      _tag: "complete",
      path: "package.json",
      classification: "conflict",
      contents: "{}",
    },
  ],
  conflicts: [{ _tag: "completeFile", path: "package.json" }],
});
const applyResult = new ApplyResult({
  created: [],
  modified: [],
  skipped: [],
  failed: [],
});
const config = new StackConfig({
  name: "pipeline-app",
  runtime: { _tag: "bun" },
});
const selection = { targets: [] };
const script = {
  label: "Failing finalize",
  command: "exit 1",
  phase: "finalize" as const,
  origin: "test",
};

const runInput = {
  selection,
  repoRoot: "/tmp/pipeline-app",
  yes: true,
  dryRun: false,
  trust: true,
  config,
};

const executable = {
  script: { ...script, workdir: "." },
  execute: () =>
    Effect.succeed({
      output: Stream.empty,
      result: Effect.succeed(
        Result.fail({
          label: script.label,
          command: script.command,
          error: "Process exited with code 1",
        }),
      ),
    }),
};

const layerWithServices = ({
  plan: planned = plan,
  preview = () => Effect.succeed(applyResult),
  run,
}: {
  plan?: Plan;
  preview?: (input: {
    readonly apply: typeof Apply.Type;
    readonly repoRoot: string;
  }) => Effect.Effect<ApplyResult, never, never>;
  run: (typeof FinalizeService.Service)["run"];
}) =>
  Layer.mergeAll(
    ScaffoldPipeline.layer,
    Layer.succeed(ScaffoldFormatter, {
      formatBlueprint: () =>
        Effect.succeed({ title: "Blueprint", content: Box.text("empty") }),
      formatPlan: () =>
        Effect.succeed({
          title: "Plan",
          summary: "empty",
          tree: Box.text("empty"),
          legend: Box.text("empty"),
        }),
    }),
    Layer.succeed(BlueprintService, {
      resolve: () => Effect.succeed(blueprint),
    }),
    Layer.succeed(PlanService, {
      build: () => Effect.succeed(planned),
    }),
    Layer.succeed(ApplyService, {
      apply: () => Effect.succeed(applyResult),
      preview,
    }),
    Layer.succeed(FinalizeService, {
      preview: () => Effect.succeed([script]),
      run,
      collectNextSteps: () => Effect.succeed([]),
    }),
    NodeServices.layer,
  );

const squashFailure = (exit: Exit.Exit<unknown, unknown>) => {
  expect(Exit.isFailure(exit)).toBe(true);
  assert(Exit.isFailure(exit), "Expected effect to fail");
  return Cause.squash(exit.cause);
};

describe("ScaffoldPipeline", () => {
  it.effect("fails non-dry-run commands when a finalize script fails", () =>
    Effect.gen(function* () {
      const pipeline = yield* ScaffoldPipeline;
      const exit = yield* Effect.exit(pipeline.run(runInput));
      const error = squashFailure(exit);

      expect(error).toBeInstanceOf(FinalizeScriptFailure);
      expect(error).toMatchObject({
        message: "1 finalize script(s) failed.",
        failed: 1,
      });
    }).pipe(
      Effect.provide(
        layerWithServices({ run: () => Effect.succeed([executable]) }),
      ),
    ),
  );

  it.effect("keeps dry-run finalize scripts as preview-only", () =>
    Effect.gen(function* () {
      const pipeline = yield* ScaffoldPipeline;
      const exit = yield* Effect.exit(
        pipeline.run({ ...runInput, dryRun: true }),
      );

      expect(Exit.isSuccess(exit)).toBe(true);
    }).pipe(
      Effect.provide(
        layerWithServices({
          run: () =>
            Effect.die(new Error("dry-run should not run finalize scripts")),
        }),
      ),
    ),
  );

  it.effect("previews dry-run conflicts as skipped decisions", () =>
    Effect.gen(function* () {
      const pipeline = yield* ScaffoldPipeline;
      const exit = yield* Effect.exit(
        pipeline.run({ ...runInput, dryRun: true }),
      );

      expect(Exit.isSuccess(exit)).toBe(true);
    }).pipe(
      Effect.provide(
        layerWithServices({
          plan: conflictPlan,
          preview: ({ apply }) => {
            expect(apply.decisions).toEqual([
              { path: "package.json", value: "skip" },
            ]);
            return Effect.succeed(applyResult);
          },
          run: () =>
            Effect.die(new Error("dry-run should not run finalize scripts")),
        }),
      ),
    ),
  );
});
