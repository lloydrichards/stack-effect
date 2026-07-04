import { CatalogService } from "@repo/catalog";
import type { Blueprint } from "@repo/domain/Blueprint";
import type { CatalogNotFound } from "@repo/domain/Catalog";
import { Plan, PlanFailure, type RepoSnapshot } from "@repo/domain/Plan";
import type { StackConfig } from "@repo/domain/Scaffold";
import { Array as Arr, Context, Effect, Layer, Option, pipe } from "effect";
import { ContributionResolver } from "./ContributionResolver";
import {
  collectAncestorPaths,
  PlanAssessor,
  type PlanningIntentPath,
} from "./PlanAssessor";
import { PlanningIntentCompiler } from "./PlanningIntentCompiler";
import { RepoSnapshotService } from "./RepoSnapshotService";

export type PlanServiceBuildInput = {
  readonly blueprint: typeof Blueprint.Type;
  readonly repoRoot: string;
  readonly config: typeof StackConfig.Type;
};

export interface PlanServiceShape {
  readonly build: (
    input: PlanServiceBuildInput,
  ) => Effect.Effect<typeof Plan.Type, PlanFailure | CatalogNotFound, never>;
}

export class PlanService extends Context.Service<
  PlanService,
  PlanServiceShape
>()("PlanService", {
  make: Effect.gen(function* () {
    const contribute = yield* ContributionResolver;
    const compiler = yield* PlanningIntentCompiler;
    const snapshot = yield* RepoSnapshotService;
    const assessor = yield* PlanAssessor;

    const build = Effect.fn("PlanService.build")(function* ({
      blueprint,
      repoRoot,
      config,
    }: PlanServiceBuildInput) {
      const normalizedContributions = yield* contribute.resolve(
        blueprint,
        config,
      );
      const planningPaths = yield* compiler.compile(normalizedContributions);

      const repoSnapshot = yield* snapshot.load({
        paths: Arr.fromIterable(
          new Set(
            Arr.flatMap(planningPaths, (planningPath) => [
              planningPath.path,
              ...collectAncestorPaths(planningPath.path),
            ]),
          ),
        ),
        repoRoot,
      });

      return yield* projectPlan({ planningPaths, repoSnapshot });
    });

    const projectPlan = ({
      planningPaths,
      repoSnapshot,
    }: {
      planningPaths: ReadonlyArray<PlanningIntentPath>;
      repoSnapshot: typeof RepoSnapshot.Type;
    }) =>
      Effect.gen(function* () {
        const snapshotPaths = new Map(
          Arr.map(
            repoSnapshot.paths,
            (snapshotPath) => [snapshotPath.path, snapshotPath] as const,
          ),
        );

        const assertAncestorDirectories = (path: string) =>
          pipe(
            Arr.findFirst(
              collectAncestorPaths(path),
              (ancestorPath) =>
                snapshotPaths.get(ancestorPath)?._tag === "file",
            ),
            Option.match({
              onNone: () => Effect.void,
              onSome: (blockedAncestorPath) =>
                Effect.fail(
                  new PlanFailure({
                    reason: "repoRootNotEmpty",
                    message: `Expected ${blockedAncestorPath} to be a directory during planning.`,
                  }),
                ),
            }),
          );

        const assessedPaths = yield* Effect.forEach(
          planningPaths,
          (planningPath) =>
            Effect.gen(function* () {
              yield* assertAncestorDirectories(planningPath.path);

              return {
                planningPath,
                assessment: assessor.assessPlanningPath({
                  planningPath,
                  snapshotPath: snapshotPaths.get(planningPath.path),
                }),
              } as const;
            }),
        );

        return new Plan({
          outcomes: Arr.map(assessedPaths, ({ planningPath, assessment }) =>
            assessor.toPlannedFileOutcome({
              planningPath,
              classification: assessment.classification,
            }),
          ),
          conflicts: Arr.flatMap(
            assessedPaths,
            ({ assessment }) => assessment.conflicts,
          ),
        }).toSorted();
      });

    return { build } satisfies PlanServiceShape;
  }),
}) {
  static readonly layer = Layer.effect(PlanService)(PlanService.make).pipe(
    Layer.provide(ContributionResolver.layer),
    Layer.provide(PlanningIntentCompiler.layer),
    Layer.provide(RepoSnapshotService.layer),
    Layer.provide(PlanAssessor.layer),
    Layer.provide(CatalogService.layer),
  );
}
