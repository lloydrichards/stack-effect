import type { Blueprint } from "@repo/domain/Blueprint";
import { pathOrd } from "@repo/domain/Order";
import {
  Plan,
  type PlanConflict,
  type PlanEntryClassification,
  PlanFailure,
  type PlannedFileOutcome,
  type RepoSnapshot,
  type RepoSnapshotPath,
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

  return Arr.sort(Arr.fromIterable(new Set(requestedPaths)), pathOrd);
};
const projectPlan = ({
  planningPaths,
  repoSnapshot,
}: {
  planningPaths: ReadonlyArray<PlanningIntentPath>;
  repoSnapshot: RepoSnapshot;
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
  classification: PlanEntryClassification;
}): PlannedFileOutcome => {
  if (planningPath.authoritativeContents !== undefined) {
    return {
      _tag: "authoritative",
      path: planningPath.path,
      classification,
      contents: planningPath.authoritativeContents,
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
): RequiredStructure => {
  const packageJsonDependencies = (["dependencies", "devDependencies"] as const)
    .map((dependencySection) => ({
      section: dependencySection,
      entries: planningPath.packageJsonDependencies
        .filter(
          (plannedDependency) =>
            plannedDependency.section === dependencySection,
        )
        .map((plannedDependency) => ({
          dependencyName: plannedDependency.dependencyName,
          dependencyValue: plannedDependency.dependencyValue,
        })),
    }))
    .filter((entry) => entry.entries.length > 0);

  return {
    packageJsonExports:
      planningPath.packageJsonExports.length > 0
        ? planningPath.packageJsonExports.map((plannedExport) => ({
            exportKey: plannedExport.exportKey,
            exportValue: plannedExport.exportValue,
          }))
        : undefined,
    packageJsonDependencies:
      packageJsonDependencies.length > 0 ? packageJsonDependencies : undefined,
    packageJsonScripts:
      planningPath.packageJsonScripts.length > 0
        ? planningPath.packageJsonScripts.map((plannedScript) => ({
            scriptName: plannedScript.scriptName,
            scriptValue: plannedScript.scriptValue,
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
const isRequiredStructureEmpty = (requiredStructure: RequiredStructure) =>
  requiredStructure.packageJsonExports === undefined &&
  requiredStructure.packageJsonDependencies === undefined &&
  requiredStructure.packageJsonScripts === undefined &&
  requiredStructure.reExports === undefined;
const assessPlanningPath = ({
  planningPath,
  snapshotPath,
}: {
  planningPath: PlanningIntentPath;
  snapshotPath: RepoSnapshotPath | undefined;
}) => {
  if (
    planningPath.authoritativeContents === undefined &&
    (planningPath.packageJsonExports.length > 0 ||
      planningPath.packageJsonDependencies.length > 0 ||
      planningPath.packageJsonScripts.length > 0)
  ) {
    return planPackageJsonMerge({
      path: planningPath.path,
      requiredExports: planningPath.packageJsonExports,
      requiredDependencies: planningPath.packageJsonDependencies,
      requiredScripts: planningPath.packageJsonScripts,
      snapshotPath,
    });
  }

  if (
    planningPath.authoritativeContents === undefined &&
    planningPath.barrelExports.length > 0
  ) {
    return planBarrelMerge({
      path: planningPath.path,
      requiredReExports: planningPath.barrelExports,
      snapshotPath,
    });
  }

  if (
    planningPath.authoritativeContents === undefined &&
    planningPath.tsconfig !== undefined
  ) {
    return planTsconfigMerge({
      path: planningPath.path,
      requiredTsconfig: planningPath.tsconfig,
      snapshotPath,
    });
  }

  if (planningPath.authoritativeContents === undefined) {
    throw new PlanFailure({
      reason: "invalidPlanIntent",
      message: `No planning intent defined for ${planningPath.path}.`,
    });
  }

  return assessAuthoritativeContents({
    path: planningPath.path,
    requiredContents: planningPath.authoritativeContents,
    snapshotPath,
  });
};
const createPathAssessment = ({
  classification,
  conflicts = [],
}: {
  classification: PlanEntryClassification;
  conflicts?: ReadonlyArray<PlanConflict>;
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
  snapshotPath: RepoSnapshotPath | undefined;
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
  requiredTsconfig: PlannedTsconfig;
  snapshotPath: RepoSnapshotPath | undefined;
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
  requiredExports: ReadonlyArray<PlannedPackageJsonExport>;
  requiredDependencies: ReadonlyArray<PlannedPackageJsonDependency>;
  requiredScripts: ReadonlyArray<PlannedPackageJsonScript>;
  snapshotPath: RepoSnapshotPath | undefined;
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
    keyOf: (plannedExport) => plannedExport.exportKey,
    valueOf: (plannedExport) => plannedExport.exportValue,
    toConflict: (plannedExport) =>
      createPackageJsonExportPlanConflict({ path, plannedExport }),
  });
  const dependencyAssessments = Record.collect(
    dependenciesBySection,
    (section, sectionDependencies) =>
      assessFlatStringRecordEntries({
        existingValue: packageJson[section],
        requiredEntries: sectionDependencies,
        keyOf: (plannedDependency) => plannedDependency.dependencyName,
        valueOf: (plannedDependency) => plannedDependency.dependencyValue,
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
    keyOf: (plannedScript) => plannedScript.scriptName,
    valueOf: (plannedScript) => plannedScript.scriptValue,
    toConflict: (plannedScript) =>
      createPackageJsonScriptPlanConflict({ path, plannedScript }),
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
  requiredReExports: ReadonlyArray<PlannedBarrelExport>;
  snapshotPath: RepoSnapshotPath | undefined;
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
}): PlanConflict => ({
  _tag: "tsconfig",
  path,
});
const createBarrelExportPlanConflict = ({
  path,
  plannedReExport,
}: {
  path: string;
  plannedReExport: PlannedBarrelExport;
}): PlanConflict => ({
  _tag: "barrelExport",
  path,
  exportPath: plannedReExport.exportPath,
});
const createPackageJsonExportPlanConflict = ({
  path,
  plannedExport,
}: {
  path: string;
  plannedExport: PlannedPackageJsonExport;
}): Extract<PlanConflict, { _tag: "packageJsonExports" }> => ({
  _tag: "packageJsonExports",
  path,
  exportKey: plannedExport.exportKey,
});
const createPackageJsonScriptPlanConflict = ({
  path,
  plannedScript,
}: {
  path: string;
  plannedScript: PlannedPackageJsonScript;
}): Extract<PlanConflict, { _tag: "packageJsonScripts" }> => ({
  _tag: "packageJsonScripts",
  path,
  scriptName: plannedScript.scriptName,
});
const createPackageJsonDependencyPlanConflict = ({
  path,
  plannedDependency,
}: {
  path: string;
  plannedDependency: PlannedPackageJsonDependency;
}): Extract<PlanConflict, { _tag: "packageJsonDependencies" }> => ({
  _tag: "packageJsonDependencies",
  path,
  section: plannedDependency.section,
  dependencyName: plannedDependency.dependencyName,
});

const collectInvalidPackageJsonConflicts = ({
  path,
  requiredExports,
  requiredDependencies,
  requiredScripts,
}: {
  path: string;
  requiredExports: ReadonlyArray<PlannedPackageJsonExport>;
  requiredDependencies: ReadonlyArray<PlannedPackageJsonDependency>;
  requiredScripts: ReadonlyArray<PlannedPackageJsonScript>;
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
  ...requiredScripts.map((plannedScript) =>
    createPackageJsonScriptPlanConflict({
      path,
      plannedScript,
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
  snapshotPath: RepoSnapshotPath | undefined;
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

type PlannedPackageJsonExport = {
  readonly exportKey: string;
  readonly exportValue: string;
};

type PlannedPackageJsonDependency = {
  readonly section: "dependencies" | "devDependencies";
  readonly dependencyName: string;
  readonly dependencyValue: string;
};

type PlannedPackageJsonScript = {
  readonly scriptName: string;
  readonly scriptValue: string;
};

type PlannedBarrelExport = {
  readonly exportPath: string;
};

type PlannedTsconfig = {
  readonly path: string;
  readonly contents: string;
};

type PlanningIntentPath = {
  readonly path: string;
  readonly authoritativeContents: string | undefined;
  readonly packageJsonExports: ReadonlyArray<PlannedPackageJsonExport>;
  readonly packageJsonDependencies: ReadonlyArray<PlannedPackageJsonDependency>;
  readonly packageJsonScripts: ReadonlyArray<PlannedPackageJsonScript>;
  readonly barrelExports: ReadonlyArray<PlannedBarrelExport>;
  readonly tsconfig: PlannedTsconfig | undefined;
};

type PlanningIntentFamily =
  | "authoritative"
  | "packageJson"
  | "barrel"
  | "tsconfig";

type PlanningIntentEntry =
  | {
      readonly _tag: "authoritative";
      readonly path: string;
      readonly contents: string;
    }
  | {
      readonly _tag: "packageJsonExport";
      readonly path: string;
      readonly exportKey: string;
      readonly exportValue: string;
    }
  | {
      readonly _tag: "packageJsonDependency";
      readonly path: string;
      readonly section: "dependencies" | "devDependencies";
      readonly dependencyName: string;
      readonly dependencyValue: string;
    }
  | {
      readonly _tag: "packageJsonScript";
      readonly path: string;
      readonly scriptName: string;
      readonly scriptValue: string;
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

type PlanningIntentPathFamily = {
  readonly path: string;
  readonly family: PlanningIntentFamily;
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
  ...contributions.packageJsonExports.map(
    (entry) =>
      ({
        _tag: "packageJsonExport",
        path: entry.packageJsonPath,
        exportKey: entry.exportKey,
        exportValue: entry.exportValue,
      }) satisfies PlanningIntentEntry,
  ),
  ...contributions.packageJsonDependencies.map(
    (entry) =>
      ({
        _tag: "packageJsonDependency",
        path: entry.packageJsonPath,
        section: entry.section,
        dependencyName: entry.dependencyName,
        dependencyValue: entry.dependencyValue,
      }) satisfies PlanningIntentEntry,
  ),
  ...contributions.packageJsonScripts.map(
    (entry) =>
      ({
        _tag: "packageJsonScript",
        path: entry.packageJsonPath,
        scriptName: entry.scriptName,
        scriptValue: entry.scriptValue,
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
          authoritativeContents: yield* requireSingleValue({
            values: authoritativeEntries.map((entry) => entry.contents),
            errorMessage: `Conflicting authoritative file outcomes for ${path}.`,
          }),
          packageJsonExports: [],
          packageJsonDependencies: [],
          packageJsonScripts: [],
          barrelExports: [],
          tsconfig: undefined,
        };
      case "packageJson":
        return {
          path,
          authoritativeContents: undefined,
          packageJsonExports: yield* collectUniqueEntries({
            entries: packageJsonExportEntries,
            keyOf: (entry) => entry.exportKey,
            valueOf: (entry) => entry.exportValue,
            toResult: ({ exportKey, exportValue }) => ({
              exportKey,
              exportValue,
            }),
            errorMessage: `Conflicting package.json export outcomes for ${path}.`,
          }),
          packageJsonDependencies: yield* collectUniqueEntries({
            entries: packageJsonDependencyEntries,
            keyOf: (entry) => `${entry.section}:${entry.dependencyName}`,
            valueOf: (entry) => entry.dependencyValue,
            toResult: ({ section, dependencyName, dependencyValue }) => ({
              section,
              dependencyName,
              dependencyValue,
            }),
            errorMessage: `Conflicting package.json dependency outcomes for ${path}.`,
          }),
          packageJsonScripts: yield* collectUniqueEntries({
            entries: packageJsonScriptEntries,
            keyOf: (entry) => entry.scriptName,
            valueOf: (entry) => entry.scriptValue,
            toResult: ({ scriptName, scriptValue }) => ({
              scriptName,
              scriptValue,
            }),
            errorMessage: `Conflicting package.json script outcomes for ${path}.`,
          }),
          barrelExports: [],
          tsconfig: undefined,
        };
      case "barrel":
        return {
          path,
          authoritativeContents: undefined,
          packageJsonExports: [],
          packageJsonDependencies: [],
          packageJsonScripts: [],
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
          authoritativeContents: undefined,
          packageJsonExports: [],
          packageJsonDependencies: [],
          packageJsonScripts: [],
          barrelExports: [],
          tsconfig: {
            path,
            contents: yield* requireSingleValue({
              values: tsconfigEntries.map((entry) => entry.contents),
              errorMessage: `Conflicting tsconfig outcomes for ${path}.`,
            }),
          },
        };
    }
  });

const derivePlanningIntentFamily = ({
  path,
  entries,
}: {
  path: string;
  entries: ReadonlyArray<PlanningIntentEntry>;
}): Effect.Effect<PlanningIntentPathFamily, PlanFailure> =>
  requireSingleValue({
    values: entries.map(toPlanningIntentFamily),
    errorMessage: `Conflicting planning intents for ${path}.`,
  }).pipe(Effect.map((family) => ({ path, family })));

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
