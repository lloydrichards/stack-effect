import { CatalogService } from "@repo/catalog";
import type { Blueprint } from "@repo/domain/Blueprint";
import { Contribution } from "@repo/domain/Catalog";
import { Plan, PlanFailure, type RepoSnapshot } from "@repo/domain/Plan";
import type {
  NormalizedContributions,
  StackConfig,
} from "@repo/domain/Scaffold";
import {
  Array as Arr,
  Context,
  Effect,
  Layer,
  Match,
  Option,
  pipe,
  Record,
  Schema,
} from "effect";
import { ContributionResolver } from "./ContributionResolver";
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
  normalizedContributions: typeof NormalizedContributions.Type,
): Effect.Effect<ReadonlyArray<PlanningIntentPath>, PlanFailure> => {
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

export const PlanningIntentEntry = Schema.TaggedUnion({
  authoritative: {
    path: Schema.String,
    contents: Schema.String,
    conflictOnModify: Schema.Boolean,
  },
  packageJsonEntry: {
    path: Schema.String,
    field: Schema.Literals([
      "exports",
      "dependencies",
      "devDependencies",
      "scripts",
    ]),
    name: Schema.String,
    value: Schema.String,
  },
  barrelExport: {
    path: Schema.String,
    exportPath: Schema.String,
  },
  tsCallArg: {
    path: Schema.String,
    targetVariable: Schema.String,
    functionName: Schema.String,
    argument: Schema.String,
    import: Schema.Struct({
      moduleSpecifier: Schema.String,
      namedImports: Schema.Union([
        Schema.Array(Schema.String),
        Schema.Undefined,
      ]),
      defaultImport: Schema.Union([Schema.String, Schema.Undefined]),
    }),
  },
});

const toPlanningIntentEntries = (
  contributions: ReadonlyArray<typeof Contribution.Type>,
): ReadonlyArray<typeof PlanningIntentEntry.Type> =>
  Arr.flatMap(
    contributions,
    (contribution): ReadonlyArray<typeof PlanningIntentEntry.Type> => {
      switch (contribution._tag) {
        case "file":
          return [
            PlanningIntentEntry.cases.authoritative.make({
              path: contribution.path,
              contents: contribution.contents,
              conflictOnModify: contribution.conflictOnModify ?? false,
            }),
          ];
        case "pkg-json-entry":
          return [
            PlanningIntentEntry.cases.packageJsonEntry.make({
              path: contribution.path,
              field: contribution.field,
              name: contribution.name,
              value: contribution.value,
            }),
          ];
        case "barrel-export":
          return [
            PlanningIntentEntry.cases.barrelExport.make({
              path: contribution.barrelPath,
              exportPath: contribution.exportPath,
            }),
          ];
        case "ts-call-arg":
          return [
            PlanningIntentEntry.cases.tsCallArg.make({
              path: contribution.path,
              targetVariable: contribution.targetVariable,
              functionName: contribution.functionName,
              argument: contribution.argument,
              import: {
                moduleSpecifier: contribution.import.moduleSpecifier,
                namedImports: contribution.import.namedImports,
                defaultImport: contribution.import.defaultImport,
              },
            }),
          ];
      }
    },
  );

const derivePlanningIntentPath = ({
  path,
  entries,
}: {
  path: string;
  entries: ReadonlyArray<typeof PlanningIntentEntry.Type>;
}): Effect.Effect<PlanningIntentPath, PlanFailure> =>
  Effect.gen(function* () {
    const family = yield* derivePlanningIntentFamily({ entries, path });
    const authoritativeEntries = entries.filter(
      PlanningIntentEntry.guards.authoritative,
    );
    const packageJsonEntries = entries.filter(
      PlanningIntentEntry.guards.packageJsonEntry,
    );
    const barrelExportEntries = entries.filter(
      PlanningIntentEntry.guards.barrelExport,
    );
    const tsCallArgEntries = entries.filter(
      PlanningIntentEntry.guards.tsCallArg,
    );

    const resolveContents = () =>
      requireSingleValue({
        values: Arr.map(authoritativeEntries, (entry) => entry.contents),
        errorMessage: `Conflicting authoritative file outcomes for ${path}.`,
      });

    const resolveConflictOnModify = () =>
      authoritativeEntries.length > 0 &&
      authoritativeEntries.some((e) => e.conflictOnModify);

    const resolvePackageJsonFields = () => {
      type PackageJsonCase =
        typeof PlanningIntentEntry.cases.packageJsonEntry.Type;

      const exportEntries = packageJsonEntries.filter(
        (e): e is PackageJsonCase & { field: "exports" } =>
          e.field === "exports",
      );
      const depEntries = packageJsonEntries.filter(
        (
          e,
        ): e is PackageJsonCase & {
          field: "dependencies" | "devDependencies";
        } => e.field === "dependencies" || e.field === "devDependencies",
      );
      const scriptEntries = packageJsonEntries.filter(
        (e): e is PackageJsonCase & { field: "scripts" } =>
          e.field === "scripts",
      );

      return Effect.all({
        exports: collectUniqueEntries({
          entries: exportEntries,
          keyOf: (entry) => entry.name,
          valueOf: (entry) => entry.value,
          toResult: (entry) => ({ name: entry.name, value: entry.value }),
          errorMessage: `Conflicting package.json export outcomes for ${path}.`,
        }),
        dependencies: collectUniqueEntries({
          entries: depEntries,
          keyOf: (entry) => `${entry.field}:${entry.name}`,
          valueOf: (entry) => entry.value,
          toResult: (entry) => ({
            section: entry.field,
            name: entry.name,
            value: entry.value,
          }),
          errorMessage: `Conflicting package.json dependency outcomes for ${path}.`,
        }),
        scripts: collectUniqueEntries({
          entries: scriptEntries,
          keyOf: (entry) => entry.name,
          valueOf: (entry) => entry.value,
          toResult: (entry) => ({ name: entry.name, value: entry.value }),
          errorMessage: `Conflicting package.json script outcomes for ${path}.`,
        }),
      });
    };

    const emptyPackageJsonFields = {
      exports: [],
      dependencies: [],
      scripts: [],
    };

    return yield* Match.value(family).pipe(
      Match.when("authoritative", () =>
        Effect.gen(function* () {
          const contents = yield* resolveContents();
          const isConflictOnModify = resolveConflictOnModify();
          return {
            path,
            contents: isConflictOnModify ? undefined : contents,
            ...emptyPackageJsonFields,
            barrelExports: [],
            compositions: [],
            tsconfig: isConflictOnModify ? { path, contents } : undefined,
          } satisfies PlanningIntentPath;
        }),
      ),
      Match.when("packageJson", () =>
        Effect.gen(function* () {
          return {
            path,
            contents: undefined,
            ...(yield* resolvePackageJsonFields()),
            barrelExports: [],
            compositions: [],
            tsconfig: undefined,
          } satisfies PlanningIntentPath;
        }),
      ),
      Match.when("barrel", () =>
        Effect.gen(function* () {
          return {
            path,
            contents: undefined,
            ...emptyPackageJsonFields,
            barrelExports: yield* collectUniqueEntries({
              entries: barrelExportEntries,
              keyOf: (entry) => entry.exportPath,
              valueOf: (entry) => entry.exportPath,
              toResult: (entry) => ({ exportPath: entry.exportPath }),
              errorMessage: `Conflicting barrel export outcomes for ${path}.`,
            }),
            compositions: [],
            tsconfig: undefined,
          } satisfies PlanningIntentPath;
        }),
      ),
      Match.when("tsCallArg", () =>
        Effect.gen(function* () {
          return {
            path,
            contents: undefined,
            ...emptyPackageJsonFields,
            barrelExports: [],
            compositions: Arr.map(tsCallArgEntries, (entry) => ({
              targetVariable: entry.targetVariable,
              functionName: entry.functionName,
              argument: entry.argument,
              import: entry.import,
            })),
            tsconfig: undefined,
          } satisfies PlanningIntentPath;
        }),
      ),
      Match.when("authoritativePackageJson", () =>
        Effect.gen(function* () {
          return {
            path,
            contents: yield* resolveContents(),
            ...(yield* resolvePackageJsonFields()),
            barrelExports: [],
            compositions: [],
            tsconfig: undefined,
          } satisfies PlanningIntentPath;
        }),
      ),
      Match.when("authoritativeTsCallArg", () =>
        Effect.gen(function* () {
          return {
            path,
            contents: yield* resolveContents(),
            ...emptyPackageJsonFields,
            barrelExports: [],
            compositions: Arr.map(tsCallArgEntries, (entry) => ({
              targetVariable: entry.targetVariable,
              functionName: entry.functionName,
              argument: entry.argument,
              import: entry.import,
            })),
            tsconfig: undefined,
          } satisfies PlanningIntentPath;
        }),
      ),
      Match.when("authoritativeBarrel", () =>
        Effect.gen(function* () {
          return {
            path,
            contents: yield* resolveContents(),
            ...emptyPackageJsonFields,
            barrelExports: yield* collectUniqueEntries({
              entries: barrelExportEntries,
              keyOf: (entry) => entry.exportPath,
              valueOf: (entry) => entry.exportPath,
              toResult: (entry) => ({ exportPath: entry.exportPath }),
              errorMessage: `Conflicting barrel export outcomes for ${path}.`,
            }),
            compositions: [],
            tsconfig: undefined,
          } satisfies PlanningIntentPath;
        }),
      ),
      Match.exhaustive,
    );
  });

type CompositePlanningIntentFamily =
  | "authoritativePackageJson"
  | "authoritativeTsCallArg"
  | "authoritativeBarrel";

const COMPOSITE_FAMILIES: ReadonlyArray<{
  pair: [PlanningIntentFamily, PlanningIntentFamily];
  result: CompositePlanningIntentFamily;
}> = [
  {
    pair: ["authoritative", "packageJson"],
    result: "authoritativePackageJson",
  },
  { pair: ["authoritative", "tsCallArg"], result: "authoritativeTsCallArg" },
  { pair: ["authoritative", "barrel"], result: "authoritativeBarrel" },
];

const derivePlanningIntentFamily = ({
  entries,
  path,
}: {
  entries: ReadonlyArray<typeof PlanningIntentEntry.Type>;
  path: string;
}): Effect.Effect<
  PlanningIntentFamily | CompositePlanningIntentFamily,
  PlanFailure
> => {
  const families = new Set(Arr.map(entries, toPlanningIntentFamily));

  if (families.size === 1) {
    // biome-ignore lint/style/noNonNullAssertion: entries is non-empty when families.size === 1
    return Effect.succeed(toPlanningIntentFamily(entries[0]!));
  }

  if (families.size === 2) {
    const match = COMPOSITE_FAMILIES.find(
      ({ pair }) => families.has(pair[0]) && families.has(pair[1]),
    );
    if (match) {
      return Effect.succeed(match.result);
    }
  }

  return Effect.fail(
    new PlanFailure({
      reason: "invalidPlanIntent",
      message: `Conflicting planning intents for ${path}.`,
    }),
  );
};

type PlanningIntentFamily =
  | "authoritative"
  | "packageJson"
  | "barrel"
  | "tsCallArg";

const toPlanningIntentFamily = PlanningIntentEntry.match({
  authoritative: () => "authoritative" as const,
  packageJsonEntry: () => "packageJson" as const,
  barrelExport: () => "barrel" as const,
  tsCallArg: () => "tsCallArg" as const,
}) satisfies (entry: typeof PlanningIntentEntry.Type) => PlanningIntentFamily;

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
      }).pipe(Effect.as(toResult(groupedEntries[0]!))),
    ),
  );
