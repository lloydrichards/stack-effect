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
import { Array as Arr, Context, Effect, Layer, Record } from "effect";
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
  );
}
const compilePlanningPaths = (
  normalizedContributions: NormalizedContributions,
): Effect.Effect<ReadonlyArray<PlanningIntentPath>, PlanFailure> => {
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
    repoSnapshot.paths.map(
      (snapshotPath) => [snapshotPath.path, snapshotPath] as const,
    ),
  );

  const assertAncestorDirectories = (path: string) => {
    const blockedAncestorPath = collectAncestorPaths(path).find(
      (ancestorPath) => snapshotPaths.get(ancestorPath)?._tag === "file",
    );

    if (blockedAncestorPath !== undefined) {
      throw new PlanFailure({
        reason: "repoRootNotEmpty",
        message: `Expected ${blockedAncestorPath} to be a directory during planning.`,
      });
    }
  };

  const assessedPaths = planningPaths.map((planningPath) => {
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
    outcomes: assessedPaths.map(({ planningPath, assessment }) =>
      toPlannedFileOutcome({
        planningPath,
        classification: assessment.classification,
      }),
    ),
    conflicts: assessedPaths.flatMap(({ assessment }) => assessment.conflicts),
  }).toSorted();
};
const toPlannedFileOutcome = ({
  planningPath,
  classification,
}: {
  planningPath: PlanningIntentPath;
  classification: typeof PlanEntryClassification.Type;
}): typeof Plan.fields.outcomes.schema.Type => {
  if (planningPath.contents !== undefined) {
    return {
      _tag: "authoritative",
      path: planningPath.path,
      classification,
      contents: planningPath.contents,
    };
  }

  if (planningPath.tsconfig !== undefined) {
    return {
      _tag: "authoritative",
      path: planningPath.path,
      classification,
      contents: planningPath.tsconfig.contents,
    };
  }

  const requiredStructure = toRequiredStructure(planningPath);

  if (isRequiredStructureEmpty(requiredStructure)) {
    throw new PlanFailure({
      reason: "invalidPlanIntent",
      message: `No planned outcome could be derived for ${planningPath.path}.`,
    });
  }

  return {
    _tag: "structural",
    path: planningPath.path,
    classification,
    requiredStructure,
  };
};
const toRequiredStructure = (
  planningPath: PlanningIntentPath,
): typeof RequiredStructure.Type => {
  const dependencies = (["dependencies", "devDependencies"] as const)
    .map((dependencySection) => ({
      section: dependencySection,
      entries: planningPath.dependencies
        .filter(
          (plannedDependency) =>
            plannedDependency.section === dependencySection,
        )
        .map((plannedDependency) => ({
          name: plannedDependency.name,
          value: plannedDependency.value,
        })),
    }))
    .filter((entry) => entry.entries.length > 0);

  return {
    exports:
      planningPath.exports.length > 0
        ? planningPath.exports.map((plannedExport) => ({
            name: plannedExport.name,
            value: plannedExport.value,
          }))
        : undefined,
    dependencies: dependencies.length > 0 ? dependencies : undefined,
    scripts:
      planningPath.scripts.length > 0
        ? planningPath.scripts.map((plannedScript) => ({
            name: plannedScript.name,
            value: plannedScript.value,
          }))
        : undefined,
    reExports:
      planningPath.barrelExports.length > 0
        ? planningPath.barrelExports.map(
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
    ...dependencyAssessments.flatMap((assessment) => assessment.conflicts),
    ...scriptAssessment.conflicts,
  ];
  const hasAdditions =
    exportAssessment.hasAdditions ||
    dependencyAssessments.some((assessment) => assessment.hasAdditions) ||
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
    const conflicts = requiredReExports.map((plannedReExport) =>
      createBarrelExportPlanConflict({ path, plannedReExport }),
    );

    return createPathAssessment({
      classification: "needsMergeStrategy",
      conflicts,
    });
  }

  const existingExportsSet = new Set(existingExports);
  const hasAdditions = requiredReExports.some(
    (plannedReExport) => !existingExportsSet.has(plannedReExport.exportPath),
  );

  return createPathAssessment({
    classification: hasAdditions ? "modify" : "unchanged",
  });
};
const parseSimpleBarrelExports = (contents: string) => {
  const parsedExports = contents
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .map((line) => line.match(simpleBarrelExportPattern)?.[1]);

  return parsedExports.every(isDefined) ? parsedExports : undefined;
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
  ...requiredExports.map((plannedExport) =>
    createPackageJsonExportPlanConflict({ path, plannedExport }),
  ),
  ...requiredDependencies.map((plannedDependency) =>
    createPackageJsonDependencyPlanConflict({
      path,
      plannedDependency,
    }),
  ),
  ...requiredScripts.map((script) =>
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
      conflicts: requiredEntries.map(toConflict),
      hasAdditions: false,
    };
  }

  const existingEntries = existingValue ?? {};
  const conflicts = requiredEntries.flatMap((entry) => {
    const existingEntry = existingEntries[keyOf(entry)];

    return existingEntry === undefined || existingEntry === valueOf(entry)
      ? []
      : [toConflict(entry)];
  });

  return {
    conflicts,
    hasAdditions: requiredEntries.some(
      (entry) => existingEntries[keyOf(entry)] === undefined,
    ),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isDefined = <Value>(value: Value | undefined): value is Value =>
  value !== undefined;

const isFlatStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) &&
  Arr.every(Record.values(value), (entry) => typeof entry === "string");

const parseJsonRecord = (
  contents: string,
): Record<string, unknown> | undefined => {
  try {
    const parsed = JSON.parse(contents) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

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

const collectAncestorPaths = (path: string): ReadonlyArray<string> =>
  path
    .split("/")
    .map((_, index, parts) => parts.slice(0, index + 1).join("/"))
    .slice(0, -1);

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
  ...normalizedContributions.targets.map((entry) => entry.contributions),
  ...normalizedContributions.modules.map((entry) => entry.contributions),
];
const toPlanningIntentEntries = (
  contributions: ReturnType<typeof flattenContributions>[number],
): ReadonlyArray<PlanningIntentEntry> => [
  ...contributions.files.map(
    (file) =>
      ({
        _tag: "authoritative",
        path: file.path,
        contents: file.contents,
      }) satisfies PlanningIntentEntry,
  ),
  ...contributions.exports.map(
    (entry) =>
      ({
        _tag: "packageJsonExport",
        path: entry.path,
        name: entry.name,
        value: entry.value,
      }) satisfies PlanningIntentEntry,
  ),
  ...contributions.dependencies.map(
    (entry) =>
      ({
        _tag: "packageJsonDependency",
        path: entry.path,
        section: entry.section,
        name: entry.name,
        value: entry.value,
      }) satisfies PlanningIntentEntry,
  ),
  ...contributions.scripts.map(
    (entry) =>
      ({
        _tag: "packageJsonScript",
        path: entry.path,
        name: entry.name,
        value: entry.value,
      }) satisfies PlanningIntentEntry,
  ),
  ...contributions.barrelExports.map(
    (entry) =>
      ({
        _tag: "barrelExport",
        path: entry.barrelPath,
        exportPath: entry.exportPath,
      }) satisfies PlanningIntentEntry,
  ),
  ...contributions.tsconfigs.map(
    (entry) =>
      ({
        _tag: "tsconfig",
        path: entry.path,
        contents: entry.contents,
      }) satisfies PlanningIntentEntry,
  ),
];

const isAuthoritativePlanningIntentEntry = (
  entry: PlanningIntentEntry,
): entry is Extract<PlanningIntentEntry, { _tag: "authoritative" }> =>
  entry._tag === "authoritative";

const isPackageJsonExportPlanningIntentEntry = (
  entry: PlanningIntentEntry,
): entry is Extract<PlanningIntentEntry, { _tag: "packageJsonExport" }> =>
  entry._tag === "packageJsonExport";

const isPackageJsonDependencyPlanningIntentEntry = (
  entry: PlanningIntentEntry,
): entry is Extract<PlanningIntentEntry, { _tag: "packageJsonDependency" }> =>
  entry._tag === "packageJsonDependency";

const isPackageJsonScriptPlanningIntentEntry = (
  entry: PlanningIntentEntry,
): entry is Extract<PlanningIntentEntry, { _tag: "packageJsonScript" }> =>
  entry._tag === "packageJsonScript";

const isBarrelExportPlanningIntentEntry = (
  entry: PlanningIntentEntry,
): entry is Extract<PlanningIntentEntry, { _tag: "barrelExport" }> =>
  entry._tag === "barrelExport";

const isTsconfigPlanningIntentEntry = (
  entry: PlanningIntentEntry,
): entry is Extract<PlanningIntentEntry, { _tag: "tsconfig" }> =>
  entry._tag === "tsconfig";

const derivePlanningIntentPath = ({
  path,
  entries,
}: {
  path: string;
  entries: ReadonlyArray<PlanningIntentEntry>;
}): Effect.Effect<PlanningIntentPath, PlanFailure> =>
  Effect.gen(function* () {
    const family = yield* derivePlanningIntentFamily({ path, entries });
    const authoritativeEntries = entries.filter(
      isAuthoritativePlanningIntentEntry,
    );
    const packageJsonExportEntries = entries.filter(
      isPackageJsonExportPlanningIntentEntry,
    );
    const packageJsonDependencyEntries = entries.filter(
      isPackageJsonDependencyPlanningIntentEntry,
    );
    const packageJsonScriptEntries = entries.filter(
      isPackageJsonScriptPlanningIntentEntry,
    );
    const barrelExportEntries = entries.filter(
      isBarrelExportPlanningIntentEntry,
    );
    const tsconfigEntries = entries.filter(isTsconfigPlanningIntentEntry);

    switch (family.family) {
      case "authoritative":
        return {
          path,
          contents: yield* requireSingleValue({
            values: authoritativeEntries.map((entry) => entry.contents),
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
              values: tsconfigEntries.map((entry) => entry.contents),
              errorMessage: `Conflicting tsconfig outcomes for ${path}.`,
            }),
          },
        };
      case "authoritativePackageJson": {
        const baseContents = yield* requireSingleValue({
          values: authoritativeEntries.map((entry) => entry.contents),
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

        const merged: Record<string, unknown> = Object.assign({}, baseJson);

        for (const exp of mergedExports) {
          const existing = merged["exports"];
          const exports: Record<string, unknown> = isRecord(existing)
            ? Object.assign({}, existing)
            : {};
          exports[exp.name] = exp.value;
          merged["exports"] = exports;
        }

        for (const dep of mergedDependencies) {
          const existing = merged[dep.section];
          const section: Record<string, unknown> = isRecord(existing)
            ? Object.assign({}, existing)
            : {};
          section[dep.name] = dep.value;
          merged[dep.section] = section;
        }

        const existingScriptsVal = merged["scripts"];
        const mergedScriptsRecord: Record<string, unknown> = isRecord(
          existingScriptsVal,
        )
          ? Object.assign({}, existingScriptsVal)
          : {};
        for (const script of mergedScripts) {
          mergedScriptsRecord[script.name] = script.value;
        }
        merged["scripts"] = mergedScriptsRecord;

        return {
          path,
          contents: JSON.stringify(merged, null, 2) + "\n",
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
  const families = new Set(entries.map(toPlanningIntentFamily));

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
): PlanningIntentFamily => {
  switch (entry._tag) {
    case "authoritative":
      return "authoritative";
    case "packageJsonExport":
    case "packageJsonDependency":
    case "packageJsonScript":
      return "packageJson";
    case "barrelExport":
      return "barrel";
    case "tsconfig":
      return "tsconfig";
  }
};

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
        values: groupedEntries.map(valueOf),
        errorMessage,
      }).pipe(Effect.as(toResult(groupedEntries[0]))),
    ),
  );
