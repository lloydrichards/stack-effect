import { CatalogService } from "@repo/catalog";
import type { Blueprint } from "@repo/domain/Blueprint";
import { pathStrOrd } from "@repo/domain/Order";
import {
  Plan,
  type PlanEntryClassification,
  PlanFailure,
  type PlannedPackageJsonDependency,
  type PlannedPackageJsonExport,
  type PlannedPackageJsonScript,
  type RepoSnapshot,
  type RequiredStructure,
} from "@repo/domain/Plan";
import {
  Array as Arr,
  Context,
  Effect,
  Layer,
  Match,
  Option,
  Predicate,
  pipe,
  Record,
  Schema,
  String as Str,
} from "effect";
import {
  ContributionResolver,
  type NormalizedContributions,
} from "./ContributionResolver";
import { RepoSnapshotService } from "./RepoSnapshotService";

export class PlanService extends Context.Service<PlanService>()("PlanService", {
  make: Effect.gen(function* () {
    const snapshot = yield* RepoSnapshotService;
    const contributionResolver = yield* ContributionResolver;

    const build = Effect.fn("PlanService.build")(function* ({
      blueprint,
      repoRoot,
    }: {
      blueprint: typeof Blueprint.Type;
      repoRoot: string;
    }) {
      const normalizedContributions =
        yield* contributionResolver.resolve(blueprint);
      const planningPaths = yield* compilePlanningPaths(
        normalizedContributions,
      );
      const paths = collectPlanInspectionPaths(planningPaths);
      const repoSnapshot = yield* snapshot.load({
        paths,
        repoRoot,
      });

      return projectPlan({ planningPaths, repoSnapshot });
    });

    return { build } as const;
  }),
}) {
  static readonly layer = Layer.effect(PlanService)(PlanService.make).pipe(
    Layer.provide(ContributionResolver.layer),
    Layer.provide(RepoSnapshotService.layer),
    Layer.provide(CatalogService.layer),
  );
}
const compilePlanningPaths = (
  normalizedContributions: NormalizedContributions,
) => {
  const flattenedEntries = Arr.flatMap(
    flattenContributions(normalizedContributions),
    toPlanningIntentEntries,
  );
  const entriesByPath = Arr.groupBy(flattenedEntries, (entry) => entry.path);

  return Effect.all(
    Record.collect(entriesByPath, (path, entries) =>
      derivePlanningIntentPath({ path, entries }),
    ),
  );
};
const collectPlanInspectionPaths = (
  planningPaths: ReadonlyArray<PlanningIntentPath>,
): ReadonlyArray<string> => {
  const requestedPaths = Arr.flatMap(planningPaths, (planningPath) => [
    planningPath.path,
    ...collectAncestorPaths(planningPath.path),
  ]);

  return Arr.sort(Arr.fromIterable(new Set(requestedPaths)), pathStrOrd);
};
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
      assessment: assessPlanningPath({
        planningPath,
        snapshotPath: snapshotPaths.get(planningPath.path),
      }),
    } as const;
  });

  return new Plan({
    outcomes: Arr.map(assessedPaths, ({ planningPath, assessment }) =>
      toPlannedFileOutcome({
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
const toPlannedFileOutcome = ({
  planningPath,
  classification,
}: {
  planningPath: PlanningIntentPath;
  classification: typeof PlanEntryClassification.Type;
}): typeof Plan.fields.outcomes.schema.Type =>
  Match.value(planningPath).pipe(
    Match.when({ contents: Match.defined }, (pp) => ({
      _tag: "authoritative" as const,
      path: pp.path,
      classification,
      contents: pp.contents,
    })),
    Match.when({ tsconfig: Match.defined }, (pp) => ({
      _tag: "authoritative" as const,
      path: pp.path,
      classification,
      contents: pp.tsconfig.contents,
    })),
    Match.orElse((pp) => {
      const requiredStructure = toRequiredStructure(pp);

      if (isRequiredStructureEmpty(requiredStructure)) {
        throw new PlanFailure({
          reason: "invalidPlanIntent",
          message: `No planned outcome could be derived for ${pp.path}.`,
        });
      }

      return {
        _tag: "structural" as const,
        path: pp.path,
        classification,
        requiredStructure,
      };
    }),
  );
const toRequiredStructure = (
  planningPath: PlanningIntentPath,
): typeof RequiredStructure.Type => {
  const dependencies = pipe(
    ["dependencies", "devDependencies"] as const,
    Arr.map((dependencySection) => ({
      section: dependencySection,
      entries: pipe(
        planningPath.dependencies,
        Arr.filter(
          (plannedDependency) =>
            plannedDependency.section === dependencySection,
        ),
        Arr.map((plannedDependency) => ({
          name: plannedDependency.name,
          value: plannedDependency.value,
        })),
      ),
    })),
    Arr.filter((entry) => entry.entries.length > 0),
  );

  return {
    exports:
      planningPath.exports.length > 0
        ? Arr.map(planningPath.exports, (plannedExport) => ({
            name: plannedExport.name,
            value: plannedExport.value,
          }))
        : undefined,
    dependencies: dependencies.length > 0 ? dependencies : undefined,
    scripts:
      planningPath.scripts.length > 0
        ? Arr.map(planningPath.scripts, (plannedScript) => ({
            name: plannedScript.name,
            value: plannedScript.value,
          }))
        : undefined,
    reExports:
      planningPath.barrelExports.length > 0
        ? Arr.map(
            planningPath.barrelExports,
            (plannedReExport) => plannedReExport.exportPath,
          )
        : undefined,
  };
};
const isRequiredStructureEmpty = (
  requiredStructure: typeof RequiredStructure.Type,
) =>
  requiredStructure.exports === undefined &&
  requiredStructure.dependencies === undefined &&
  requiredStructure.scripts === undefined &&
  requiredStructure.reExports === undefined;
const assessPlanningPath = ({
  planningPath,
  snapshotPath,
}: {
  planningPath: PlanningIntentPath;
  snapshotPath: typeof RepoSnapshot.fields.paths.schema.Type | undefined;
}) => {
  if (
    planningPath.contents === undefined &&
    (planningPath.exports.length > 0 ||
      planningPath.dependencies.length > 0 ||
      planningPath.scripts.length > 0)
  ) {
    return planPackageJsonMerge({
      path: planningPath.path,
      requiredExports: planningPath.exports,
      requiredDependencies: planningPath.dependencies,
      requiredScripts: planningPath.scripts,
      snapshotPath,
    });
  }

  if (
    planningPath.contents === undefined &&
    planningPath.barrelExports.length > 0
  ) {
    return planBarrelMerge({
      path: planningPath.path,
      requiredReExports: planningPath.barrelExports,
      snapshotPath,
    });
  }

  if (
    planningPath.contents === undefined &&
    planningPath.tsconfig !== undefined
  ) {
    return planTsconfigMerge({
      path: planningPath.path,
      requiredTsconfig: planningPath.tsconfig,
      snapshotPath,
    });
  }

  if (planningPath.contents === undefined) {
    throw new PlanFailure({
      reason: "invalidPlanIntent",
      message: `No planning intent defined for ${planningPath.path}.`,
    });
  }

  return assessAuthoritativeContents({
    path: planningPath.path,
    requiredContents: planningPath.contents,
    snapshotPath,
  });
};
const createPathAssessment = ({
  classification,
  conflicts = [],
}: {
  classification: typeof PlanEntryClassification.Type;
  conflicts?: typeof Plan.fields.conflicts.Type;
}) => ({
  classification,
  conflicts: Arr.fromIterable(conflicts),
});

type FlatStringRecordAssessment<Conflict> = {
  readonly conflicts: ReadonlyArray<Conflict>;
  readonly hasAdditions: boolean;
};

const assessAuthoritativeContents = ({
  path,
  requiredContents,
  snapshotPath,
}: {
  path: string;
  requiredContents: string;
  snapshotPath: typeof RepoSnapshot.fields.paths.schema.Type | undefined;
}) => {
  const existingContents = getExistingFileContents({ path, snapshotPath });

  if (existingContents === undefined) {
    return createPathAssessment({ classification: "create" });
  }

  if (existingContents === requiredContents) {
    return createPathAssessment({ classification: "unchanged" });
  }

  return createPathAssessment({ classification: "modify" });
};
const planTsconfigMerge = ({
  path,
  requiredTsconfig,
  snapshotPath,
}: {
  path: string;
  requiredTsconfig: PlanningIntentTsconfig;
  snapshotPath: typeof RepoSnapshot.fields.paths.schema.Type | undefined;
}) => {
  const authoritativeAssessment = assessAuthoritativeContents({
    path,
    requiredContents: requiredTsconfig.contents,
    snapshotPath,
  });

  if (authoritativeAssessment.classification !== "modify") {
    return authoritativeAssessment;
  }

  const conflict = createTsconfigPlanConflict({
    path,
  });

  return createPathAssessment({
    classification: "needsMergeStrategy",
    conflicts: [conflict],
  });
};
const planPackageJsonMerge = ({
  path,
  requiredExports,
  requiredDependencies,
  requiredScripts,
  snapshotPath,
}: {
  path: string;
  requiredExports: ReadonlyArray<typeof PlannedPackageJsonExport.Type>;
  requiredDependencies: ReadonlyArray<PlanningIntentPackageJsonDependency>;
  requiredScripts: ReadonlyArray<typeof PlannedPackageJsonScript.Type>;
  snapshotPath: typeof RepoSnapshot.fields.paths.schema.Type | undefined;
}) => {
  const existingContents = getExistingFileContents({ path, snapshotPath });

  if (existingContents === undefined) {
    return createPathAssessment({ classification: "create" });
  }

  const packageJson = parseJsonRecord(existingContents);

  if (packageJson === undefined) {
    return createPathAssessment({
      classification: "needsMergeStrategy",
      conflicts: collectInvalidPackageJsonConflicts({
        path,
        requiredExports,
        requiredDependencies,
        requiredScripts,
      }),
    });
  }

  const dependenciesBySection = Arr.groupBy(
    requiredDependencies,
    (plannedDependency) => plannedDependency.section,
  );
  const exportAssessment = assessFlatStringRecordEntries({
    existingValue: packageJson["exports"],
    requiredEntries: requiredExports,
    keyOf: (plannedExport) => plannedExport.name,
    valueOf: (plannedExport) => plannedExport.value,
    toConflict: (plannedExport) =>
      createPackageJsonExportPlanConflict({ path, plannedExport }),
  });
  const dependencyAssessments = Record.collect(
    dependenciesBySection,
    (section, sectionDependencies) =>
      assessFlatStringRecordEntries({
        existingValue: packageJson[section],
        requiredEntries: sectionDependencies,
        keyOf: (plannedDependency) => plannedDependency.name,
        valueOf: (plannedDependency) => plannedDependency.value,
        toConflict: (plannedDependency) =>
          createPackageJsonDependencyPlanConflict({
            path,
            plannedDependency,
          }),
      }),
  );
  const scriptAssessment = assessFlatStringRecordEntries({
    existingValue: packageJson["scripts"],
    requiredEntries: requiredScripts,
    keyOf: (script) => script.name,
    valueOf: (script) => script.value,
    toConflict: (script) => createScriptPlanConflict({ path, script }),
  });
  const conflicts = [
    ...exportAssessment.conflicts,
    ...Arr.flatMap(dependencyAssessments, (assessment) => assessment.conflicts),
    ...scriptAssessment.conflicts,
  ];
  const hasAdditions =
    exportAssessment.hasAdditions ||
    Arr.some(dependencyAssessments, (assessment) => assessment.hasAdditions) ||
    scriptAssessment.hasAdditions;

  if (conflicts.length > 0) {
    return createPathAssessment({
      classification: "needsMergeStrategy",
      conflicts,
    });
  }

  return createPathAssessment({
    classification: hasAdditions ? "modify" : "unchanged",
  });
};
const planBarrelMerge = ({
  path,
  requiredReExports,
  snapshotPath,
}: {
  path: string;
  requiredReExports: ReadonlyArray<PlanningIntentBarrelExport>;
  snapshotPath: typeof RepoSnapshot.fields.paths.schema.Type | undefined;
}) => {
  const existingContents = getExistingFileContents({ path, snapshotPath });

  if (existingContents === undefined) {
    return createPathAssessment({ classification: "create" });
  }

  const existingExports = parseSimpleBarrelExports(existingContents);

  if (existingExports === undefined) {
    const conflicts = Arr.map(requiredReExports, (plannedReExport) =>
      createBarrelExportPlanConflict({ path, plannedReExport }),
    );

    return createPathAssessment({
      classification: "needsMergeStrategy",
      conflicts,
    });
  }

  const existingExportsSet = new Set(existingExports);
  const hasAdditions = Arr.some(
    requiredReExports,
    (plannedReExport) => !existingExportsSet.has(plannedReExport.exportPath),
  );

  return createPathAssessment({
    classification: hasAdditions ? "modify" : "unchanged",
  });
};
const parseSimpleBarrelExports = (contents: string) => {
  const parsedExports = Arr.map(
    Arr.filter(Str.split(contents, /\r?\n/u), (line) => Str.trim(line) !== ""),
    (line) => line.match(simpleBarrelExportPattern)?.[1],
  );

  return Arr.every(parsedExports, Predicate.isNotUndefined)
    ? parsedExports
    : undefined;
};
const simpleBarrelExportPattern = /^export \* from "(\.[^"]*)";$/;
const createTsconfigPlanConflict = ({
  path,
}: {
  path: string;
}): typeof Plan.fields.conflicts.schema.Type => ({
  _tag: "tsconfig",
  path,
});
const createBarrelExportPlanConflict = ({
  path,
  plannedReExport,
}: {
  path: string;
  plannedReExport: PlanningIntentBarrelExport;
}): typeof Plan.fields.conflicts.schema.Type => ({
  _tag: "barrelExport",
  path,
  exportPath: plannedReExport.exportPath,
});
const createPackageJsonExportPlanConflict = ({
  path,
  plannedExport,
}: {
  path: string;
  plannedExport: typeof PlannedPackageJsonExport.Type;
}): Extract<typeof Plan.fields.conflicts.schema.Type, { _tag: "exports" }> => ({
  _tag: "exports",
  path,
  name: plannedExport.name,
});
const createScriptPlanConflict = ({
  path,
  script,
}: {
  path: string;
  script: typeof PlannedPackageJsonScript.Type;
}): Extract<typeof Plan.fields.conflicts.schema.Type, { _tag: "scripts" }> => ({
  _tag: "scripts",
  path,
  name: script.name,
});
const createPackageJsonDependencyPlanConflict = ({
  path,
  plannedDependency,
}: {
  path: string;
  plannedDependency: PlanningIntentPackageJsonDependency;
}): Extract<
  typeof Plan.fields.conflicts.schema.Type,
  { _tag: "dependencies" }
> => ({
  _tag: "dependencies",
  path,
  section: plannedDependency.section,
  name: plannedDependency.name,
});

const collectInvalidPackageJsonConflicts = ({
  path,
  requiredExports,
  requiredDependencies,
  requiredScripts,
}: {
  path: string;
  requiredExports: ReadonlyArray<typeof PlannedPackageJsonExport.Type>;
  requiredDependencies: ReadonlyArray<PlanningIntentPackageJsonDependency>;
  requiredScripts: ReadonlyArray<typeof PlannedPackageJsonScript.Type>;
}) => [
  ...Arr.map(requiredExports, (plannedExport) =>
    createPackageJsonExportPlanConflict({ path, plannedExport }),
  ),
  ...Arr.map(requiredDependencies, (plannedDependency) =>
    createPackageJsonDependencyPlanConflict({
      path,
      plannedDependency,
    }),
  ),
  ...Arr.map(requiredScripts, (script) =>
    createScriptPlanConflict({
      path,
      script,
    }),
  ),
];

const assessFlatStringRecordEntries = <Entry, Conflict>({
  existingValue,
  requiredEntries,
  keyOf,
  valueOf,
  toConflict,
}: {
  existingValue: unknown;
  requiredEntries: ReadonlyArray<Entry>;
  keyOf: (entry: Entry) => string;
  valueOf: (entry: Entry) => string;
  toConflict: (entry: Entry) => Conflict;
}): FlatStringRecordAssessment<Conflict> => {
  if (existingValue !== undefined && !isFlatStringRecord(existingValue)) {
    return {
      conflicts: Arr.map(requiredEntries, toConflict),
      hasAdditions: false,
    };
  }

  const existingEntries = existingValue ?? {};
  const conflicts = Arr.flatMap(requiredEntries, (entry) => {
    const existingEntry = existingEntries[keyOf(entry)];

    return existingEntry === undefined || existingEntry === valueOf(entry)
      ? []
      : [toConflict(entry)];
  });

  return {
    conflicts,
    hasAdditions: Arr.some(
      requiredEntries,
      (entry) => existingEntries[keyOf(entry)] === undefined,
    ),
  };
};

const isFlatStringRecord = (value: unknown): value is Record<string, string> =>
  Predicate.isReadonlyObject(value) &&
  Arr.every(
    Record.values(value as Record<string, unknown>),
    (entry) => typeof entry === "string",
  );

const parseJsonRecord = (
  contents: string,
): Record<string, unknown> | undefined =>
  pipe(
    Schema.decodeUnknownOption(
      Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
    )(contents),
    Option.getOrUndefined,
  );

const getExistingFileContents = ({
  path,
  snapshotPath,
}: {
  path: string;
  snapshotPath: typeof RepoSnapshot.fields.paths.schema.Type | undefined;
}): string | undefined => {
  if (snapshotPath === undefined || snapshotPath._tag === "missing") {
    return undefined;
  }

  if (snapshotPath._tag !== "file") {
    throw new PlanFailure({
      reason: "repoRootNotEmpty",
      message: `Expected ${path} to be a file during planning.`,
    });
  }

  return snapshotPath.contents;
};

const collectAncestorPaths = (path: string): ReadonlyArray<string> => {
  const parts = Str.split(path, "/");
  return Arr.map(Arr.take(parts, parts.length - 1), (_, index) =>
    Arr.join(Arr.take(parts, index + 1), "/"),
  );
};

type PlanningIntentPackageJsonDependency = {
  readonly section: "dependencies" | "devDependencies";
} & typeof PlannedPackageJsonDependency.Type;

type PlanningIntentBarrelExport = {
  readonly exportPath: string;
};

type PlanningIntentTsconfig = {
  readonly path: string;
  readonly contents: string;
};

type PlanningIntentPath = {
  readonly path: string;
  readonly contents: string | undefined;
  readonly exports: ReadonlyArray<typeof PlannedPackageJsonExport.Type>;
  readonly dependencies: ReadonlyArray<PlanningIntentPackageJsonDependency>;
  readonly scripts: ReadonlyArray<typeof PlannedPackageJsonScript.Type>;
  readonly barrelExports: ReadonlyArray<PlanningIntentBarrelExport>;
  readonly tsconfig: PlanningIntentTsconfig | undefined;
};

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

const flattenContributions = (
  normalizedContributions: NormalizedContributions,
) => [
  ...Arr.map(normalizedContributions.targets, (entry) => entry.contributions),
  ...Arr.map(normalizedContributions.modules, (entry) => entry.contributions),
];
const toPlanningIntentEntries = (
  contributions: ReturnType<typeof flattenContributions>[number],
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
    const authoritativeEntries = (byTag["authoritative"] ??
      []) as ReadonlyArray<
      Extract<PlanningIntentEntry, { _tag: "authoritative" }>
    >;
    const packageJsonExportEntries = (byTag["packageJsonExport"] ??
      []) as ReadonlyArray<
      Extract<PlanningIntentEntry, { _tag: "packageJsonExport" }>
    >;
    const packageJsonDependencyEntries = (byTag["packageJsonDependency"] ??
      []) as ReadonlyArray<
      Extract<PlanningIntentEntry, { _tag: "packageJsonDependency" }>
    >;
    const packageJsonScriptEntries = (byTag["packageJsonScript"] ??
      []) as ReadonlyArray<
      Extract<PlanningIntentEntry, { _tag: "packageJsonScript" }>
    >;
    const barrelExportEntries = (byTag["barrelExport"] ?? []) as ReadonlyArray<
      Extract<PlanningIntentEntry, { _tag: "barrelExport" }>
    >;
    const tsconfigEntries = (byTag["tsconfig"] ?? []) as ReadonlyArray<
      Extract<PlanningIntentEntry, { _tag: "tsconfig" }>
    >;

    switch (family.family) {
      case "authoritative":
        return {
          path,
          contents: yield* requireSingleValue({
            values: Arr.map(authoritativeEntries, (entry) => entry.contents),
            errorMessage: `Conflicting authoritative file outcomes for ${path}.`,
          }),
          exports: [],
          dependencies: [],
          scripts: [],
          barrelExports: [],
          tsconfig: undefined,
        };
      case "packageJson":
        return {
          path,
          contents: undefined,
          exports: yield* collectUniqueEntries({
            entries: packageJsonExportEntries,
            keyOf: (entry) => entry.name,
            valueOf: (entry) => entry.value,
            toResult: ({ name, value }) => ({
              name,
              value,
            }),
            errorMessage: `Conflicting package.json export outcomes for ${path}.`,
          }),
          dependencies: yield* collectUniqueEntries({
            entries: packageJsonDependencyEntries,
            keyOf: (entry) => `${entry.section}:${entry.name}`,
            valueOf: (entry) => entry.value,
            toResult: ({ section, name, value }) => ({
              section,
              name,
              value,
            }),
            errorMessage: `Conflicting package.json dependency outcomes for ${path}.`,
          }),
          scripts: yield* collectUniqueEntries({
            entries: packageJsonScriptEntries,
            keyOf: (entry) => entry.name,
            valueOf: (entry) => entry.value,
            toResult: ({ name, value }) => ({
              name,
              value,
            }),
            errorMessage: `Conflicting package.json script outcomes for ${path}.`,
          }),
          barrelExports: [],
          tsconfig: undefined,
        };
      case "barrel":
        return {
          path,
          contents: undefined,
          exports: [],
          dependencies: [],
          scripts: [],
          barrelExports: yield* collectUniqueEntries({
            entries: barrelExportEntries,
            keyOf: (entry) => entry.exportPath,
            valueOf: (entry) => entry.exportPath,
            toResult: ({ exportPath }) => ({ exportPath }),
            errorMessage: `Conflicting barrel export outcomes for ${path}.`,
          }),
          tsconfig: undefined,
        };
      case "tsconfig":
        return {
          path,
          contents: undefined,
          exports: [],
          dependencies: [],
          scripts: [],
          barrelExports: [],
          tsconfig: {
            path,
            contents: yield* requireSingleValue({
              values: Arr.map(tsconfigEntries, (entry) => entry.contents),
              errorMessage: `Conflicting tsconfig outcomes for ${path}.`,
            }),
          },
        };
      case "authoritativePackageJson": {
        const baseContents = yield* requireSingleValue({
          values: Arr.map(authoritativeEntries, (entry) => entry.contents),
          errorMessage: `Conflicting authoritative file outcomes for ${path}.`,
        });
        const baseJson = parseJsonRecord(baseContents);

        if (baseJson === undefined) {
          return yield* new PlanFailure({
            reason: "invalidPlanIntent",
            message: `Authoritative base for ${path} is not valid JSON; cannot merge structural contributions.`,
          });
        }

        const mergedExports = yield* collectUniqueEntries({
          entries: packageJsonExportEntries,
          keyOf: (entry) => entry.name,
          valueOf: (entry) => entry.value,
          toResult: ({ name, value }) => ({ name, value }),
          errorMessage: `Conflicting package.json export outcomes for ${path}.`,
        });
        const mergedDependencies = yield* collectUniqueEntries({
          entries: packageJsonDependencyEntries,
          keyOf: (entry) => `${entry.section}:${entry.name}`,
          valueOf: (entry) => entry.value,
          toResult: ({ section, name, value }) => ({ section, name, value }),
          errorMessage: `Conflicting package.json dependency outcomes for ${path}.`,
        });
        const mergedScripts = yield* collectUniqueEntries({
          entries: packageJsonScriptEntries,
          keyOf: (entry) => entry.name,
          valueOf: (entry) => entry.value,
          toResult: ({ name, value }) => ({ name, value }),
          errorMessage: `Conflicting package.json script outcomes for ${path}.`,
        });

        const resolveSection = (
          root: Record<string, unknown>,
          key: string,
          entries: ReadonlyArray<{
            readonly name: string;
            readonly value: string;
          }>,
        ): Record<string, unknown> => {
          const base = Predicate.isReadonlyObject(root[key])
            ? (root[key] as Record<string, unknown>)
            : {};
          return {
            ...root,
            [key]: Arr.reduce(entries, base, (acc, entry) => ({
              ...acc,
              [entry.name]: entry.value,
            })),
          };
        };

        const merged = pipe(
          { ...baseJson } as Record<string, unknown>,
          (root) => resolveSection(root, "exports", mergedExports),
          (root) =>
            Arr.reduce(mergedDependencies, root, (r, dep) =>
              resolveSection(r, dep.section, [
                { name: dep.name, value: dep.value },
              ]),
            ),
          (root) => resolveSection(root, "scripts", mergedScripts),
        );

        const contents = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
        )(merged);

        return {
          path,
          contents,
          exports: [],
          dependencies: [],
          scripts: [],
          barrelExports: [],
          tsconfig: undefined,
        };
      }
    }
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

type PlanningIntentFamily =
  | "authoritative"
  | "packageJson"
  | "barrel"
  | "tsconfig";

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
