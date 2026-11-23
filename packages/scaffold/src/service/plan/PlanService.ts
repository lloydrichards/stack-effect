import type { Blueprint } from "@repo/domain/Blueprint";
import type { CatalogNotFound } from "@repo/domain/Catalog";
import { Plan, PlanFailure, type RepoSnapshot } from "@repo/domain/Plan";
import type { StackConfig } from "@repo/domain/Scaffold";
import { Array as Arr, Context, Effect, Layer, SchemaIssue } from "effect";
import { ContributionResolver } from "./ContributionResolver";
import { validatePackageOwners } from "./PackageOwnership";
import * as PlanAssessment from "./PlanAssessment";
import type { PlanningIntentPath } from "./PlanAssessment";
import * as PlanningIntent from "./PlanningIntent";
import * as RepositoryState from "./RepositoryState";
import {
  registerWorkspaceMembers,
  workspaceManifestPaths,
} from "./WorkspaceMembership";

const formatSchemaIssue = SchemaIssue.makeFormatterDefault();

export type PlanServiceBuildInput = {
  readonly blueprint: typeof Blueprint.Type;
  readonly repoRoot: string;
  readonly config: typeof StackConfig.Type;
};

export type PlanServiceShape = {
  readonly build: (
    input: PlanServiceBuildInput,
  ) => Effect.Effect<typeof Plan.Type, PlanFailure | CatalogNotFound, never>;
};

export class PlanService extends Context.Service<
  PlanService,
  PlanServiceShape
>()("PlanService", {
  make: Effect.gen(function* () {
    const contribute = yield* ContributionResolver;
    const repositoryState = yield* RepositoryState.RepositoryState;

    const build = Effect.fn("PlanService.build")(function* ({
      blueprint,
      repoRoot,
      config,
    }: PlanServiceBuildInput) {
      const owners = yield* repositoryState.discoverOwners(repoRoot);
      yield* validatePackageOwners(blueprint, owners);
      const normalizedContributions = yield* contribute.resolve(
        blueprint,
        config,
      );
      const planningPaths = yield* PlanningIntent.compile(
        normalizedContributions,
      );

      const captured = yield* repositoryState.capture({
        repoRoot,
        paths: Arr.fromIterable(
          new Set([
            ".",
            ...workspaceManifestPaths,
            ...Arr.flatMap(planningPaths, (planningPath) => [
              planningPath.path,
              ...PlanAssessment.collectAncestorPaths(planningPath.path),
            ]),
          ]),
        ),
      });
      // Keep the owners validated above so drift since validation fails the recheck below.
      const baseline = { ...captured.baseline, packageOwners: owners };
      const plan = yield* projectPlan({
        planningPaths,
        repoSnapshot: captured.snapshot,
        baseline,
      });
      const current = yield* repositoryState.capture({
        repoRoot,
        paths: baseline.paths.map((entry) => entry.path),
      });
      const changes = RepositoryState.compare(baseline, current.baseline);
      if (changes.length > 0) {
        return yield* new PlanFailure({
          message: `Repository changed during planning: ${changes.map((change) => `${change.path} (${change.kind})`).join(", ")}. Replan and try again.`,
        });
      }
      return plan;
    });

    const projectPlan = ({
      planningPaths,
      repoSnapshot,
      baseline,
    }: {
      planningPaths: ReadonlyArray<PlanningIntentPath>;
      repoSnapshot: typeof RepoSnapshot.Type;
      baseline: (typeof Plan.Type)["baseline"];
    }) =>
      Effect.gen(function* () {
        const snapshotPaths = new Map(
          Arr.map(
            repoSnapshot.paths,
            (snapshotPath) => [snapshotPath.path, snapshotPath] as const,
          ),
        );

        const assessedPaths = yield* Effect.forEach(planningPaths, (intent) =>
          Effect.gen(function* () {
            const snapshotPath = snapshotPaths.get(intent.path);
            const planningPath = PlanAssessment.preserveDenoSqlitePermissions(
              intent,
              snapshotPath,
            );

            return {
              planningPath,
              assessment: yield* PlanAssessment.assess({
                planningPath,
                snapshotPath,
              }),
            } as const;
          }),
        );

        const plan = yield* Plan.makeEffect({
          baseline,
          outcomes: yield* registerWorkspaceMembers(
            Arr.map(assessedPaths, ({ planningPath, assessment }) =>
              PlanAssessment.toPlannedFileOutcome({
                planningPath,
                classification: assessment.classification,
              }),
            ),
            repoSnapshot,
            (baseline.packageOwners ?? []).map((owner) => owner.path),
          ),
          conflicts: Arr.flatMap(
            assessedPaths,
            ({ assessment }) => assessment.conflicts,
          ),
        }).pipe(
          Effect.mapError(
            (cause) =>
              new PlanFailure({
                message: `Invalid projected Plan: ${formatSchemaIssue(cause)}`,
                cause,
              }),
          ),
        );

        return plan.toSorted();
      });

    return { build } satisfies PlanServiceShape;
  }),
}) {
  static readonly layer = Layer.effect(PlanService)(PlanService.make).pipe(
    Layer.provide(ContributionResolver.layer),
    Layer.provide(RepositoryState.RepositoryState.layer),
  );
}
