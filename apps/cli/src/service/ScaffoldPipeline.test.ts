import assert from "node:assert/strict";
import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { type Apply, ApplyResult } from "@repo/domain/Apply";
import type { MaterializedApply } from "@repo/domain/Apply";
import { Blueprint } from "@repo/domain/Blueprint";
import { Plan, RepositoryPath } from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import { ApplyService } from "@repo/scaffold/ApplyService";
import { ApplyWorkspaces } from "@repo/scaffold/ApplyWorkspaces";
import { BlueprintService } from "@repo/scaffold/BlueprintService";
import { FinalizeService } from "@repo/scaffold/FinalizeService";
import { PlanService } from "@repo/scaffold/PlanService";
import * as MockTerminal from "@repo/tui/test/MockTerminal";
import { Cause, Effect, Exit, Layer, Result, Stream } from "effect";
import { TestConsole } from "effect/testing";
import { ScaffoldPipeline } from "./ScaffoldPipeline";

const blueprint = new Blueprint({ nodes: [], edges: [] });
const baseline = { root: "/tmp/pipeline-app", paths: [] };
const plan = new Plan({ baseline, outcomes: [], conflicts: [] });
const conflictPlan = new Plan({
  baseline: {
    root: "/tmp/pipeline-app",
    paths: [{ _tag: "missing", path: RepositoryPath.make("package.json") }],
  },
  outcomes: [
    {
      _tag: "complete",
      path: RepositoryPath.make("package.json"),
      classification: "conflict",
      contents: "{}",
    },
  ],
  conflicts: [
    { _tag: "completeFile", path: RepositoryPath.make("package.json") },
    {
      _tag: "scripts",
      path: RepositoryPath.make("package.json"),
      name: "test",
    },
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
  repositoryRoot: "/tmp/pipeline-app",
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
  apply = () => Effect.succeed(applyResult),
  executeScoped,
}: {
  plan?: Plan;
  materialize?: (apply: Apply) => Effect.Effect<MaterializedApply>;
  apply?: (typeof ApplyService.Service)["apply"];
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
    Layer.succeed(ApplyService, { apply }),
    Layer.succeed(ApplyWorkspaces, {
      empty: Effect.die(new Error("dry run should seed the workspace")),
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
    "should skip each conflicted path once when applying with --yes",
    () =>
      Effect.gen(function* () {
        const decisions: Array<Apply["decisions"]> = [];
        yield* Effect.gen(function* () {
          const pipeline = yield* ScaffoldPipeline;
          return yield* Effect.exit(pipeline.run(runInput));
        }).pipe(
          Effect.provide(
            layerWithServices({
              plan: conflictPlan,
              apply: ({ apply }) => {
                decisions.push(apply.decisions);
                return Effect.succeed(applyResult);
              },
              executeScoped: failingExecution,
            }),
          ),
        );

        expect(decisions).toEqual([[{ path: "package.json", value: "skip" }]]);
      }),
  );

  it.effect(
    "should ask before overriding each conflicted path when applying interactively",
    () =>
      Effect.gen(function* () {
        const decisions: Array<Apply["decisions"]> = [];
        yield* Effect.gen(function* () {
          yield* MockTerminal.inputKey("enter"); // Continue with these changes
          yield* MockTerminal.inputKey("enter"); // Conflict at package.json: keep default skip
          yield* MockTerminal.inputKey("enter"); // Apply changes
          const pipeline = yield* ScaffoldPipeline;
          return yield* Effect.exit(pipeline.run({ ...runInput, yes: false }));
        }).pipe(
          Effect.provide(
            Layer.merge(
              layerWithServices({
                plan: conflictPlan,
                apply: ({ apply }) => {
                  decisions.push(apply.decisions);
                  return Effect.succeed(applyResult);
                },
                executeScoped: failingExecution,
              }),
              MockTerminal.layer,
            ),
          ),
        );
        const conflictPrompt = (yield* TestConsole.logLines)
          .map(String)
          .find((frame) =>
            frame.includes(
              "Conflict at package.json (completeFile, scripts). Override?",
            ),
          );

        expect(decisions).toEqual([[{ path: "package.json", value: "skip" }]]);
        // The prompt shows the formatted Plan it asks about.
        expect(conflictPrompt).toContain("Plan");
      }).pipe(Effect.provide(TestConsole.layer)),
  );

  it.effect(
    "should reject incompatible required dependencies before applying",
    () =>
      Effect.gen(function* () {
        const pipeline = yield* ScaffoldPipeline;
        const exit = yield* Effect.exit(pipeline.run(runInput));

        expect(squashFailure(exit)).toMatchObject({
          _tag: "DependencyConflictFailure",
          message:
            "Cannot apply modules with required dependency conflicts at package.json: foldkit. Resolve the dependency versions before applying these modules.",
        });
      }).pipe(
        Effect.provide(
          layerWithServices({
            plan: new Plan({
              ...conflictPlan,
              conflicts: [
                {
                  _tag: "dependencies",
                  path: RepositoryPath.make("package.json"),
                  section: "dependencies",
                  name: "foldkit",
                },
              ],
            }),
            apply: () =>
              Effect.die(new Error("dependency conflicts must fail first")),
            executeScoped: failingExecution,
          }),
        ),
      ),
  );

  it.effect("should fail when a non-dry-run finalize script fails", () =>
    Effect.gen(function* () {
      const pipeline = yield* ScaffoldPipeline;
      const exit = yield* Effect.exit(pipeline.run(runInput));
      const error = squashFailure(exit);

      expect(error).toMatchObject({
        _tag: "FinalizeScriptFailure",
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
                      path: RepositoryPath.make("package.json"),
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
