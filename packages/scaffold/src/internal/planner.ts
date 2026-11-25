import type { Blueprint } from "@repo/domain/Blueprint";
import {
  Plan,
  PlanError,
  type RepoSnapshot,
  type RepoSnapshotPath,
  repositoryRootPath,
} from "@repo/domain/Plan";
import type { StackConfig } from "@repo/domain/StackConfig";
import { Array as Arr, Effect, SchemaIssue } from "effect";
import type { ContributionResolver } from "../Plan";
import { validatePackageOwners } from "./packageOwnership";
import * as PlanAssessment from "./planAssessment";
import type { PlanningIntentPath } from "./planAssessment";
import * as PlanningIntent from "./planningIntent";
import * as RepositoryState from "./repositoryState";
import {
  registerWorkspaceMembers,
  workspaceManifestPaths,
} from "./workspaceMembership";

const formatSchemaIssue = SchemaIssue.makeFormatterDefault();

const assessPlanningPath = Effect.fnUntraced(function* (
  snapshotPaths: ReadonlyMap<string, RepoSnapshotPath>,
  intent: PlanningIntentPath,
) {
  const snapshotPath = snapshotPaths.get(intent.path);
  const buildConfigPath = PlanAssessment.compiledExportConfigPath(intent);
  const compiled = yield* PlanAssessment.useCompiledPackageExports(
    intent,
    snapshotPath,
    buildConfigPath === undefined
      ? undefined
      : snapshotPaths.get(buildConfigPath),
  );
  const planningPath = PlanAssessment.preserveDenoSqlitePermissions(
    compiled,
    snapshotPath,
  );
  const assessment = yield* PlanAssessment.assess({
    planningPath,
    snapshotPath,
  });
  return { planningPath, assessment };
});

const projectPlan = Effect.fnUntraced(function* ({
  planningPaths,
  repositorySnapshot,
  baseline,
}: {
  planningPaths: ReadonlyArray<PlanningIntentPath>;
  repositorySnapshot: RepoSnapshot;
  baseline: Plan["baseline"];
}) {
  const snapshotPaths = new Map(
    repositorySnapshot.paths.map(
      (snapshotPath) => [snapshotPath.path, snapshotPath] as const,
    ),
  );

  const assessedPaths = yield* Effect.forEach(planningPaths, (intent) =>
    assessPlanningPath(snapshotPaths, intent),
  );

  const outcomes = yield* registerWorkspaceMembers(
    assessedPaths.map(({ planningPath, assessment }) =>
      PlanAssessment.toPlannedFileOutcome({
        planningPath,
        classification: assessment.classification,
      }),
    ),
    repositorySnapshot,
    (baseline.packageOwners ?? []).map((owner) => owner.path),
  );
  const plan = yield* Plan.makeEffect({
    baseline,
    outcomes,
    conflicts: assessedPaths.flatMap(({ assessment }) => assessment.conflicts),
  }).pipe(
    Effect.mapError(
      (cause) =>
        new PlanError({
          message: `Invalid projected Plan: ${formatSchemaIssue(cause)}`,
          cause,
        }),
    ),
  );

  return plan.toSorted();
});

/** @internal */
export const makePlanner = (contribute: ContributionResolver["Service"]) =>
  Effect.gen(function* () {
    const repositoryState = yield* RepositoryState.RepositoryState;

    const build = Effect.fn("Planner.build")(function* ({
      blueprint,
      repositoryRoot,
      config,
    }: {
      blueprint: Blueprint;
      repositoryRoot: string;
      config: StackConfig;
    }) {
      const repository = repositoryState.at(repositoryRoot);
      const owners = yield* repository.discoverOwners;
      yield* validatePackageOwners(blueprint, owners);
      const normalizedContributions = yield* contribute.resolve(
        blueprint,
        config,
      );
      const planningPaths = yield* PlanningIntent.compile(
        normalizedContributions,
      );

      const captured = yield* repository.capture(
        Arr.dedupe(
          [
            repositoryRootPath,
            ...workspaceManifestPaths,
            ...planningPaths.flatMap((planningPath) => [
              planningPath.path,
              ...PlanAssessment.collectAncestorPaths(planningPath.path),
              PlanAssessment.compiledExportConfigPath(planningPath),
            ]),
          ].filter((path) => path !== undefined),
        ),
      );
      // Keep the owners validated above so drift since validation fails the recheck below.
      const baseline = { ...captured.baseline, packageOwners: owners };
      const plan = yield* projectPlan({
        planningPaths,
        repositorySnapshot: captured.snapshot,
        baseline,
      });

      const current = yield* repository.capture(
        baseline.paths.map((entry) => entry.path),
      );
      const changes = RepositoryState.compare(baseline, current.baseline);
      if (changes.length > 0) {
        return yield* new PlanError({
          message: `Repository changed during planning: ${changes.map((change) => `${change.path} (${change.kind})`).join(", ")}. Replan and try again.`,
        });
      }
      return plan;
    });

    return { build };
  });
