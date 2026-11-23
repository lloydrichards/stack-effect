import type { Blueprint } from "@repo/domain/Blueprint";
import type { CatalogNotFound } from "@repo/domain/Catalog";
import {
  Plan,
  PlanFailure,
  type RepoSnapshot,
  repositoryRootPath,
} from "@repo/domain/Plan";
import type { StackConfig } from "@repo/domain/Scaffold";
import { Context, Effect, Layer, SchemaIssue } from "effect";
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

  const assessedPaths = [];
  for (const intent of planningPaths) {
    const snapshotPath = snapshotPaths.get(intent.path);
    const planningPath = PlanAssessment.preserveDenoSqlitePermissions(
      intent,
      snapshotPath,
    );
    const assessment = yield* PlanAssessment.assess({
      planningPath,
      snapshotPath,
    });
    assessedPaths.push({ planningPath, assessment });
  }

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
        new PlanFailure({
          message: `Invalid projected Plan: ${formatSchemaIssue(cause)}`,
          cause,
        }),
    ),
  );

  return plan.toSorted();
});

export class PlanService extends Context.Service<
  PlanService,
  {
    readonly build: (input: {
      readonly blueprint: Blueprint;
      readonly repositoryRoot: string;
      readonly config: StackConfig;
    }) => Effect.Effect<Plan, PlanFailure | CatalogNotFound>;
  }
>()("@repo/scaffold/PlanService") {
  // Tests substitute RepositoryState through this; inline it into `layer` once they run the real owner.
  static readonly make = Effect.gen(function* () {
    const contribute = yield* ContributionResolver;
    const repositoryState = yield* RepositoryState.RepositoryState;

    const build = Effect.fn("PlanService.build")(function* ({
      blueprint,
      repositoryRoot,
      config,
    }: {
      readonly blueprint: Blueprint;
      readonly repositoryRoot: string;
      readonly config: StackConfig;
    }) {
      const owners = yield* repositoryState.discoverOwners(repositoryRoot);
      yield* validatePackageOwners(blueprint, owners);
      const normalizedContributions = yield* contribute.resolve(
        blueprint,
        config,
      );
      const planningPaths = yield* PlanningIntent.compile(
        normalizedContributions,
      );

      const captured = yield* repositoryState.capture({
        repositoryRoot,
        paths: [
          ...new Set([
            repositoryRootPath,
            ...workspaceManifestPaths,
            ...planningPaths.flatMap((planningPath) => [
              planningPath.path,
              ...PlanAssessment.collectAncestorPaths(planningPath.path),
            ]),
          ]),
        ],
      });
      // Keep the owners validated above so drift since validation fails the recheck below.
      const baseline = { ...captured.baseline, packageOwners: owners };
      const plan = yield* projectPlan({
        planningPaths,
        repositorySnapshot: captured.snapshot,
        baseline,
      });

      const current = yield* repositoryState.capture({
        repositoryRoot,
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

    return PlanService.of({ build });
  });

  static readonly layer = Layer.effect(PlanService, PlanService.make).pipe(
    Layer.provide(ContributionResolver.layer),
    Layer.provide(RepositoryState.RepositoryState.layer),
  );
}
