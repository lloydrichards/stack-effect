import assert from "node:assert/strict";
import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { type Apply, ApplyResult } from "@repo/domain/Apply";
import { Blueprint } from "@repo/domain/Blueprint";
import { Plan } from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import {
  ApplyService,
  ApplyWorkspaceService,
  BlueprintService,
  FinalizeService,
  type MaterializedApply,
  PlanService,
} from "@repo/scaffold";
import type { ConfirmOptions } from "@repo/tui";
import { Cause, Effect, Exit, Layer, Result, Stream } from "effect";
import { Box } from "effect-boxes";
import {
  FinalizeScriptFailure,
  resolveConflictDecisions,
  ScaffoldPipeline,
} from "./ScaffoldPipeline";

const blueprint = new Blueprint({ nodes: [], edges: [] });
const baseline = { root: "/tmp/pipeline-app", paths: [] };
const plan = new Plan({ baseline, outcomes: [], conflicts: [] });
const conflictPlan = new Plan({
  baseline: {
    root: "/tmp/pipeline-app",
    paths: [{ _tag: "missing", path: "package.json" }],
  },
  outcomes: [
    {
      _tag: "complete",
      path: "package.json",
      classification: "conflict",
      contents: "{}",
    },
  ],
  conflicts: [
    { _tag: "completeFile", path: "package.json" },
    { _tag: "scripts", path: "package.json", name: "test" },
  ],
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
  workdir: ".",
  phase: "finalize" as const,
  origin: "test",
};

const runInput = {
  selection,
  repoRoot: "/tmp/pipeline-app",
  yes: true,
  dryRun: false,
  showFiles: false,
  trust: true,
  config,
};

const failingExecution = () =>
  Effect.succeed({
    output: Stream.empty,
    result: Effect.succeed(
      Result.fail({
        label: script.label,
        command: script.command,
        error: "Process exited with code 1",
      }),
    ),
  });

const runFinalizeScriptsInDryRun = () =>
  Effect.die(new Error("dry-run should not run finalize scripts"));

const layerWithServices = ({
  plan: planned = plan,
  materialize = () => Effect.succeed({ apply: applyResult, files: [] }),
  executeScoped,
}: {
  plan?: Plan;
  materialize?: (apply: Apply) => Effect.Effect<MaterializedApply>;
  executeScoped: (typeof FinalizeService.Service)["executeScoped"];
}) =>
  Layer.mergeAll(
    ScaffoldPipeline.layer,
    Layer.succeed(BlueprintService, {
      resolve: () => Effect.succeed(blueprint),
    }),
    Layer.succeed(PlanService, {
      build: () => Effect.succeed(planned),
    }),
    Layer.succeed(ApplyService, {
      apply: () => Effect.succeed(applyResult),
    }),
    Layer.succeed(ApplyWorkspaceService, {
      empty: () => Effect.die(new Error("dry run should seed the workspace")),
      fromRepository: () =>
        Effect.succeed({
          plan: () => Effect.die(new Error("dry run should not replan")),
          materialize,
        }),
    }),
    Layer.succeed(FinalizeService, {
      scripts: () => Effect.succeed([script]),
      executeScoped,
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
  it.effect(
    "should resolve one decision per path in interactive and automatic modes",
    () =>
      Effect.gen(function* () {
        const prompts: Array<ConfirmOptions> = [];
        const planBox = Box.text("formatted plan");

        const decisions = yield* resolveConflictDecisions({
          plan: conflictPlan,
          yes: false,
          planBox,
          confirm: (options) => {
            prompts.push(options);
            return Effect.succeed(false);
          },
        });

        expect(prompts).toHaveLength(1);
        expect(decisions).toEqual([{ path: "package.json", value: "skip" }]);
        const options = prompts[0];
        expect(options?.message).toBe(
          "Conflict at package.json (completeFile, scripts). Override?",
        );
        expect(options?.children).toBe(planBox);

        const automaticDecisions = yield* resolveConflictDecisions({
          plan: conflictPlan,
          yes: true,
          planBox,
          confirm: () =>
            Effect.die(new Error("automatic mode should not prompt")),
        });

        expect(automaticDecisions).toEqual([
          { path: "package.json", value: "skip" },
        ]);
      }),
  );

  for (const yes of [true, false]) {
    it.effect(
      `should reject incompatible required dependencies in ${yes ? "automatic" : "interactive"} mode`,
      () =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            resolveConflictDecisions({
              plan: new Plan({
                ...conflictPlan,
                conflicts: [
                  {
                    _tag: "dependencies",
                    path: "package.json",
                    section: "dependencies",
                    name: "foldkit",
                  },
                ],
              }),
              yes,
              planBox: Box.text("formatted plan"),
              confirm: () =>
                Effect.die(
                  new Error("dependency conflicts must fail before prompting"),
                ),
            }),
          );
          expect(squashFailure(exit)).toMatchObject({
            _tag: "DependencyConflictFailure",
            message:
              "Cannot apply modules with required dependency conflicts at package.json: foldkit. Resolve the dependency versions before applying these modules.",
          });
        }),
    );
  }

  it.effect("should fail when a non-dry-run finalize script fails", () =>
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
      Effect.provide(layerWithServices({ executeScoped: failingExecution })),
    ),
  );

  it.effect("should not execute finalize scripts when running a dry run", () =>
    Effect.gen(function* () {
      const pipeline = yield* ScaffoldPipeline;
      const exit = yield* Effect.exit(
        pipeline.run({ ...runInput, dryRun: true }),
      );

      expect(Exit.isSuccess(exit)).toBe(true);
    }).pipe(
      Effect.provide(
        layerWithServices({
          executeScoped: runFinalizeScriptsInDryRun,
        }),
      ),
    ),
  );

  it.effect(
    "should use memory-backed Apply when generated files are requested",
    () =>
      Effect.gen(function* () {
        const exit = yield* Effect.gen(function* () {
          const pipeline = yield* ScaffoldPipeline;
          return yield* Effect.exit(
            pipeline.run({ ...runInput, dryRun: true, showFiles: true }),
          );
        }).pipe(
          Effect.provide(
            layerWithServices({
              materialize: () =>
                Effect.succeed({
                  apply: applyResult,
                  files: [
                    {
                      path: "package.json",
                      status: "created",
                      contents: "{}\n",
                    },
                  ],
                }),
              executeScoped: runFinalizeScriptsInDryRun,
            }),
          ),
        );

        expect(Exit.isSuccess(exit)).toBe(true);
      }),
  );

  it.effect(
    "should preview one skipped decision per conflicted path during a dry run",
    () =>
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
            materialize: (apply) => {
              expect(apply.decisions).toEqual([
                { path: "package.json", value: "skip" },
              ]);
              return Effect.succeed({ apply: applyResult, files: [] });
            },
            executeScoped: runFinalizeScriptsInDryRun,
          }),
        ),
      ),
  );
});
