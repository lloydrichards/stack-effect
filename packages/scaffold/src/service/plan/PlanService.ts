import { CatalogService } from "@repo/catalog";
import type { Blueprint } from "@repo/domain/Blueprint";
import { DesiredContributions } from "@repo/domain/Catalog";
import { Plan, PlanFailure, type RepoSnapshot } from "@repo/domain/Plan";
import type { StackConfig } from "@repo/domain/Scaffold";
import {
  Array as Arr,
  Context,
  Effect,
  Layer,
  Match,
  Option,
  pipe,
  Record,
} from "effect";
import {
  ContributionResolver,
  type NormalizedContributions,
} from "./ContributionResolver";
import {
  collectAncestorPaths,
  PlanAssessor,
  type PlanningIntentPath,
} from "./PlanAssessor";
import { RepoSnapshotService } from "./RepoSnapshotService";

export class PlanService extends Context.Service<PlanService>()("PlanService", {
  make: Effect.gen(function* () {
    const contribute = yield* ContributionResolver;
    const snapshot = yield* RepoSnapshotService;
    const assessor = yield* PlanAssessor;

    const build = Effect.fn("PlanService.build")(function* ({
      blueprint,
      repoRoot,
      config,
    }: {
      blueprint: typeof Blueprint.Type;
      repoRoot: string;
      config: typeof StackConfig.Type;
    }) {
      const normalizedContributions = yield* contribute.resolve(
        blueprint,
        config,
      );
      const planningPaths = yield* compilePlanningPaths(
        normalizedContributions,
      );

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

      return projectPlan({ planningPaths, repoSnapshot });
    });

    const projectPlan = ({
      planningPaths,
      repoSnapshot,
    }: {
      planningPaths: ReadonlyArray<PlanningIntentPath>;
      repoSnapshot: typeof RepoSnapshot.Type;
    }) => {
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
            (ancestorPath) => snapshotPaths.get(ancestorPath)?._tag === "file",
          ),
          Option.match({
            onNone: () => {},
            onSome: (blockedAncestorPath) => {
              throw new PlanFailure({
                reason: "repoRootNotEmpty",
                message: `Expected ${blockedAncestorPath} to be a directory during planning.`,
              });
            },
          }),
        );

      const assessedPaths = Arr.map(planningPaths, (planningPath) => {
        assertAncestorDirectories(planningPath.path);

        return {
          planningPath,
          assessment: assessor.assessPlanningPath({
            planningPath,
            snapshotPath: snapshotPaths.get(planningPath.path),
          }),
        } as const;
      });

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
    };

    return { build } as const;
  }),
}) {
  static readonly layer = Layer.effect(PlanService)(PlanService.make).pipe(
    Layer.provide(ContributionResolver.layer),
    Layer.provide(RepoSnapshotService.layer),
    Layer.provide(PlanAssessor.layer),
    Layer.provide(CatalogService.layer),
  );
}

const compilePlanningPaths = (
  normalizedContributions: NormalizedContributions,
) => {
  const entriesByPath = Arr.groupBy(
    Arr.flatMap(
      [
        ...Arr.map(
          normalizedContributions.targets,
          (entry) => entry.contributions,
        ),
        ...Arr.map(
          normalizedContributions.modules,
          (entry) => entry.contributions,
        ),
      ],
      toPlanningIntentEntries,
    ),
    (entry) => entry.path,
  );

  return Effect.all(
    Record.collect(entriesByPath, (path, entries) =>
      derivePlanningIntentPath({ path, entries }),
    ),
  );
};

// --- Planning intent types and derivation ---

type PlanningIntentEntry =
  | {
      readonly _tag: "authoritative";
      readonly path: string;
      readonly contents: string;
    }
  | {
      readonly _tag: "packageJsonExport";
      readonly path: string;
      readonly name: string;
      readonly value: string;
    }
  | {
      readonly _tag: "packageJsonDependency";
      readonly path: string;
      readonly section: "dependencies" | "devDependencies";
      readonly name: string;
      readonly value: string;
    }
  | {
      readonly _tag: "packageJsonScript";
      readonly path: string;
      readonly name: string;
      readonly value: string;
    }
  | {
      readonly _tag: "barrelExport";
      readonly path: string;
      readonly exportPath: string;
    }
  | {
      readonly _tag: "tsconfig";
      readonly path: string;
      readonly contents: string;
    };

type PlanningIntentFamily =
  | "authoritative"
  | "packageJson"
  | "barrel"
  | "tsconfig";

const toPlanningIntentEntries = (
  contributions: typeof DesiredContributions.Type,
): ReadonlyArray<PlanningIntentEntry> => [
  ...Arr.map(
    contributions.files,
    (file) =>
      ({
        _tag: "authoritative",
        path: file.path,
        contents: file.contents,
      }) satisfies PlanningIntentEntry,
  ),
  ...Arr.map(
    contributions.exports,
    (entry) =>
      ({
        _tag: "packageJsonExport",
        path: entry.path,
        name: entry.name,
        value: entry.value,
      }) satisfies PlanningIntentEntry,
  ),
  ...Arr.map(
    contributions.dependencies,
    (entry) =>
      ({
        _tag: "packageJsonDependency",
        path: entry.path,
        section: entry.section,
        name: entry.name,
        value: entry.value,
      }) satisfies PlanningIntentEntry,
  ),
  ...Arr.map(
    contributions.scripts,
    (entry) =>
      ({
        _tag: "packageJsonScript",
        path: entry.path,
        name: entry.name,
        value: entry.value,
      }) satisfies PlanningIntentEntry,
  ),
  ...Arr.map(
    contributions.barrelExports,
    (entry) =>
      ({
        _tag: "barrelExport",
        path: entry.barrelPath,
        exportPath: entry.exportPath,
      }) satisfies PlanningIntentEntry,
  ),
  ...Arr.map(
    contributions.tsconfigs,
    (entry) =>
      ({
        _tag: "tsconfig",
        path: entry.path,
        contents: entry.contents,
      }) satisfies PlanningIntentEntry,
  ),
];

const derivePlanningIntentPath = ({
  path,
  entries,
}: {
  path: string;
  entries: ReadonlyArray<PlanningIntentEntry>;
}) =>
  Effect.gen(function* () {
    const family = yield* derivePlanningIntentFamily({ path, entries });
    const byTag = Arr.groupBy(entries, (entry) => entry._tag);

    const tagged = <T extends PlanningIntentEntry["_tag"]>(tag: T) =>
      (byTag[tag] ?? []) as ReadonlyArray<
        Extract<PlanningIntentEntry, { _tag: T }>
      >;

    const resolveContents = () =>
      requireSingleValue({
        values: Arr.map(tagged("authoritative"), (entry) => entry.contents),
        errorMessage: `Conflicting authoritative file outcomes for ${path}.`,
      });

    const resolvePackageJsonFields = () =>
      Effect.all({
        exports: collectUniqueEntries({
          entries: tagged("packageJsonExport"),
          keyOf: (entry) => entry.name,
          valueOf: (entry) => entry.value,
          toResult: ({ name, value }) => ({ name, value }),
          errorMessage: `Conflicting package.json export outcomes for ${path}.`,
        }),
        dependencies: collectUniqueEntries({
          entries: tagged("packageJsonDependency"),
          keyOf: (entry) => `${entry.section}:${entry.name}`,
          valueOf: (entry) => entry.value,
          toResult: ({ section, name, value }) => ({ section, name, value }),
          errorMessage: `Conflicting package.json dependency outcomes for ${path}.`,
        }),
        scripts: collectUniqueEntries({
          entries: tagged("packageJsonScript"),
          keyOf: (entry) => entry.name,
          valueOf: (entry) => entry.value,
          toResult: ({ name, value }) => ({ name, value }),
          errorMessage: `Conflicting package.json script outcomes for ${path}.`,
        }),
      });

    const emptyPackageJsonFields = {
      exports: [],
      dependencies: [],
      scripts: [],
    } as const;

    return yield* Match.value(family.family).pipe(
      Match.when("authoritative", () =>
        Effect.gen(function* () {
          return {
            path,
            contents: yield* resolveContents(),
            ...emptyPackageJsonFields,
            barrelExports: [],
            tsconfig: undefined,
          };
        }),
      ),
      Match.when("packageJson", () =>
        Effect.gen(function* () {
          return {
            path,
            contents: undefined,
            ...(yield* resolvePackageJsonFields()),
            barrelExports: [],
            tsconfig: undefined,
          };
        }),
      ),
      Match.when("barrel", () =>
        Effect.gen(function* () {
          return {
            path,
            contents: undefined,
            ...emptyPackageJsonFields,
            barrelExports: yield* collectUniqueEntries({
              entries: tagged("barrelExport"),
              keyOf: (entry) => entry.exportPath,
              valueOf: (entry) => entry.exportPath,
              toResult: ({ exportPath }) => ({ exportPath }),
              errorMessage: `Conflicting barrel export outcomes for ${path}.`,
            }),
            tsconfig: undefined,
          };
        }),
      ),
      Match.when("tsconfig", () =>
        Effect.gen(function* () {
          return {
            path,
            contents: undefined,
            ...emptyPackageJsonFields,
            barrelExports: [],
            tsconfig: {
              path,
              contents: yield* requireSingleValue({
                values: Arr.map(tagged("tsconfig"), (entry) => entry.contents),
                errorMessage: `Conflicting tsconfig outcomes for ${path}.`,
              }),
            },
          };
        }),
      ),
      Match.when("authoritativePackageJson", () =>
        Effect.gen(function* () {
          return {
            path,
            contents: yield* resolveContents(),
            ...(yield* resolvePackageJsonFields()),
            barrelExports: [],
            tsconfig: undefined,
          };
        }),
      ),
      Match.exhaustive,
    );
  });

const derivePlanningIntentFamily = ({
  path,
  entries,
}: {
  path: string;
  entries: ReadonlyArray<PlanningIntentEntry>;
}): Effect.Effect<
  { path: string; family: PlanningIntentFamily | "authoritativePackageJson" },
  PlanFailure
> => {
  const families = new Set(Arr.map(entries, toPlanningIntentFamily));

  if (families.size === 1) {
    // entries is non-empty when families.size === 1
    // biome-ignore lint/style/noNonNullAssertion: guaranteed by size check
    const family = toPlanningIntentFamily(entries[0]!);
    return Effect.succeed({ path, family });
  }

  if (
    families.size === 2 &&
    families.has("authoritative") &&
    families.has("packageJson")
  ) {
    return Effect.succeed({
      path,
      family: "authoritativePackageJson" as const,
    });
  }

  return Effect.fail(
    new PlanFailure({
      reason: "invalidPlanIntent",
      message: `Conflicting planning intents for ${path}.`,
    }),
  );
};

const toPlanningIntentFamily = (
  entry: PlanningIntentEntry,
): PlanningIntentFamily =>
  Match.value(entry).pipe(
    Match.tags({
      authoritative: () => "authoritative" as const,
      packageJsonExport: () => "packageJson" as const,
      packageJsonDependency: () => "packageJson" as const,
      packageJsonScript: () => "packageJson" as const,
      barrelExport: () => "barrel" as const,
      tsconfig: () => "tsconfig" as const,
    }),
    Match.exhaustive,
  );

const requireSingleValue = <Value>({
  values,
  errorMessage,
}: {
  values: ReadonlyArray<Value>;
  errorMessage: string;
}): Effect.Effect<Value, PlanFailure> => {
  const firstValue = values[0];

  if (
    firstValue !== undefined &&
    Arr.every(values, (value) => value === firstValue)
  ) {
    return Effect.succeed(firstValue);
  }

  return Effect.fail(
    new PlanFailure({
      reason: "invalidPlanIntent",
      message: errorMessage,
    }),
  );
};

const collectUniqueEntries = <Entry, Result>({
  entries,
  keyOf,
  valueOf,
  toResult,
  errorMessage,
}: {
  entries: ReadonlyArray<Entry>;
  keyOf: (entry: Entry) => string;
  valueOf: (entry: Entry) => string;
  toResult: (entry: Entry) => Result;
  errorMessage: string;
}): Effect.Effect<ReadonlyArray<Result>, PlanFailure> =>
  Effect.all(
    Record.collect(Arr.groupBy(entries, keyOf), (_, groupedEntries) =>
      requireSingleValue({
        values: Arr.map(groupedEntries, valueOf),
        errorMessage,
      }).pipe(Effect.as(toResult(groupedEntries[0]))),
    ),
  );
