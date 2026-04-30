import {
  Plan,
  type PlanEntryClassification,
  PlanFailure,
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

type PlanningIntentPackageJsonDependency = {
  readonly section: "dependencies" | "devDependencies";
  readonly name: string;
  readonly value: string;
};

export type PlanningIntentPath = {
  readonly path: string;
  readonly contents: string | undefined;
  readonly exports: ReadonlyArray<{ name: string; value: string }>;
  readonly dependencies: ReadonlyArray<PlanningIntentPackageJsonDependency>;
  readonly scripts: ReadonlyArray<{ name: string; value: string }>;
  readonly barrelExports: ReadonlyArray<{ exportPath: string }>;
  readonly tsconfig:
    | {
        path: string;
        contents: string;
      }
    | undefined;
};

type PathAssessment = {
  readonly classification: typeof PlanEntryClassification.Type;
  readonly conflicts: typeof Plan.fields.conflicts.Type;
};

type FlatStringRecordAssessment<Conflict> = {
  readonly conflicts: ReadonlyArray<Conflict>;
  readonly hasAdditions: boolean;
};

export class PlanAssessor extends Context.Service<PlanAssessor>()(
  "PlanAssessor",
  {
    make: Effect.succeed({
      toPlannedFileOutcome,
      assessPlanningPath,
      collectAncestorPaths,
    }),
  },
) {
  static readonly layer = Layer.effect(PlanAssessor)(PlanAssessor.make);
}

function toPlannedFileOutcome({
  planningPath,
  classification,
}: {
  planningPath: PlanningIntentPath;
  classification: typeof PlanEntryClassification.Type;
}): typeof Plan.fields.outcomes.schema.Type {
  const requiredStructure = toRequiredStructure(planningPath);
  const hasStructure = !isRequiredStructureEmpty(requiredStructure);
  const contents =
    planningPath.contents ?? planningPath.tsconfig?.contents ?? undefined;

  return Match.value({
    hasContents: contents !== undefined,
    hasStructure,
  }).pipe(
    Match.when({ hasContents: true, hasStructure: true }, () => ({
      _tag: "composed" as const,
      path: planningPath.path,
      classification,
      contents: contents!,
      requiredStructure,
    })),
    Match.when({ hasContents: true, hasStructure: false }, () => ({
      _tag: "complete" as const,
      path: planningPath.path,
      classification,
      contents: contents!,
    })),
    Match.when({ hasContents: false, hasStructure: true }, () => ({
      _tag: "partial" as const,
      path: planningPath.path,
      classification,
      requiredStructure,
    })),
    Match.when({ hasContents: false, hasStructure: false }, () => {
      throw new PlanFailure({
        reason: "invalidPlanIntent",
        message: `No planned outcome could be derived for ${planningPath.path}.`,
      });
    }),
    Match.exhaustive,
  );
}

function toRequiredStructure(
  planningPath: PlanningIntentPath,
): typeof RequiredStructure.Type {
  const dependencies = pipe(
    ["dependencies", "devDependencies"] as const,
    Arr.map((section) => ({
      section,
      entries: pipe(
        planningPath.dependencies,
        Arr.filter((d) => d.section === section),
        Arr.map(({ name, value }) => ({ name, value })),
      ),
    })),
    Arr.filter((entry) => entry.entries.length > 0),
  );

  return {
    exports: Arr.match(planningPath.exports, {
      onEmpty: () => undefined,
      onNonEmpty: Arr.map(({ name, value }) => ({ name, value })),
    }),
    dependencies: Arr.match(dependencies, {
      onEmpty: () => undefined,
      onNonEmpty: (deps) => deps,
    }),
    scripts: Arr.match(planningPath.scripts, {
      onEmpty: () => undefined,
      onNonEmpty: Arr.map(({ name, value }) => ({ name, value })),
    }),
    reExports: Arr.match(planningPath.barrelExports, {
      onEmpty: () => undefined,
      onNonEmpty: Arr.map((e) => e.exportPath),
    }),
  };
}

function isRequiredStructureEmpty(
  requiredStructure: typeof RequiredStructure.Type,
) {
  return (
    requiredStructure.exports === undefined &&
    requiredStructure.dependencies === undefined &&
    requiredStructure.scripts === undefined &&
    requiredStructure.reExports === undefined
  );
}

function assessPlanningPath({
  planningPath,
  snapshotPath,
}: {
  planningPath: PlanningIntentPath;
  snapshotPath: typeof RepoSnapshot.fields.paths.schema.Type | undefined;
}): PathAssessment {
  const hasContents = planningPath.contents !== undefined;
  const hasPackageJsonFields =
    planningPath.exports.length > 0 ||
    planningPath.dependencies.length > 0 ||
    planningPath.scripts.length > 0;
  const hasBarrelExports = planningPath.barrelExports.length > 0;
  const hasTsconfig = planningPath.tsconfig !== undefined;

  return Match.value({
    hasContents,
    hasPackageJsonFields,
    hasBarrelExports,
    hasTsconfig,
  }).pipe(
    Match.when({ hasContents: true }, () =>
      assessAuthoritativeContents(planningPath, snapshotPath),
    ),
    Match.when({ hasPackageJsonFields: true }, () =>
      planPackageJsonMerge(planningPath, snapshotPath),
    ),
    Match.when({ hasBarrelExports: true }, () =>
      planBarrelMerge(planningPath, snapshotPath),
    ),
    Match.when({ hasTsconfig: true }, () =>
      planTsconfigMerge(planningPath, snapshotPath),
    ),
    Match.orElse(() => {
      throw new PlanFailure({
        reason: "invalidPlanIntent",
        message: `No planning intent defined for ${planningPath.path}.`,
      });
    }),
  );
}

export function collectAncestorPaths(path: string): ReadonlyArray<string> {
  const parts = Str.split(path, "/");
  return Arr.map(Arr.take(parts, parts.length - 1), (_, index) =>
    Arr.join(Arr.take(parts, index + 1), "/"),
  );
}

// --- Internal helpers ---

type SnapshotPath = typeof RepoSnapshot.fields.paths.schema.Type | undefined;

const createPathAssessment = ({
  classification,
  conflicts = [],
}: {
  classification: typeof PlanEntryClassification.Type;
  conflicts?: typeof Plan.fields.conflicts.Type;
}): PathAssessment => ({
  classification,
  conflicts: Arr.fromIterable(conflicts),
});

const assessAuthoritativeContents = (
  planningPath: PlanningIntentPath,
  snapshotPath: SnapshotPath,
) => {
  const existingContents = getExistingFileContents(
    planningPath.path,
    snapshotPath,
  );
  const requiredContents = planningPath.contents!;

  if (existingContents === undefined) {
    return createPathAssessment({ classification: "create" });
  }

  if (existingContents === requiredContents) {
    return createPathAssessment({ classification: "unchanged" });
  }

  return createPathAssessment({ classification: "modify" });
};

const planTsconfigMerge = (
  planningPath: PlanningIntentPath,
  snapshotPath: SnapshotPath,
) => {
  const tsconfigPath = {
    ...planningPath,
    contents: planningPath.tsconfig!.contents,
  };
  const authoritativeAssessment = assessAuthoritativeContents(
    tsconfigPath,
    snapshotPath,
  );

  if (authoritativeAssessment.classification !== "modify") {
    return authoritativeAssessment;
  }

  return createPathAssessment({
    classification: "conflict",
    conflicts: [planConflict.tsconfig(planningPath.path)],
  });
};

const planPackageJsonMerge = (
  planningPath: PlanningIntentPath,
  snapshotPath: SnapshotPath,
) => {
  const {
    path,
    exports: requiredExports,
    dependencies: requiredDependencies,
    scripts: requiredScripts,
  } = planningPath;
  const existingContents = getExistingFileContents(path, snapshotPath);

  if (existingContents === undefined) {
    return createPathAssessment({ classification: "create" });
  }

  const packageJson = parseJsonRecord(existingContents);

  if (packageJson === undefined) {
    return createPathAssessment({
      classification: "conflict",
      conflicts: collectInvalidPackageJsonConflicts(planningPath),
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
      planConflict.exports(path, plannedExport.name),
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
          planConflict.dependencies(path, plannedDependency),
      }),
  );
  const scriptAssessment = assessFlatStringRecordEntries({
    existingValue: packageJson["scripts"],
    requiredEntries: requiredScripts,
    keyOf: (script) => script.name,
    valueOf: (script) => script.value,
    toConflict: (script) => planConflict.scripts(path, script.name),
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
      classification: "conflict",
      conflicts,
    });
  }

  return createPathAssessment({
    classification: hasAdditions ? "modify" : "unchanged",
  });
};

const planBarrelMerge = (
  planningPath: PlanningIntentPath,
  snapshotPath: SnapshotPath,
) => {
  const { path, barrelExports: requiredReExports } = planningPath;
  const existingContents = getExistingFileContents(path, snapshotPath);

  if (existingContents === undefined) {
    return createPathAssessment({ classification: "create" });
  }

  const existingExports = parseSimpleBarrelExports(existingContents);

  if (existingExports === undefined) {
    const conflicts = Arr.map(requiredReExports, (plannedReExport) =>
      planConflict.barrelExport(path, plannedReExport.exportPath),
    );

    return createPathAssessment({
      classification: "conflict",
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

export const parseSimpleBarrelExports = (contents: string) => {
  const parsedExports = Arr.map(
    Arr.filter(Str.split(contents, /\r?\n/u), (line) => Str.trim(line) !== ""),
    (line) => line.match(simpleBarrelExportPattern)?.[1],
  );

  return Arr.every(parsedExports, Predicate.isNotUndefined)
    ? parsedExports
    : undefined;
};

const simpleBarrelExportPattern = /^export \* from "(\.[^"]*)";$/;

const planConflict = {
  tsconfig: (path: string) => ({
    _tag: "tsconfig" as const,
    path,
  }),
  barrelExport: (path: string, exportPath: string) => ({
    _tag: "barrelExport" as const,
    path,
    exportPath,
  }),
  exports: (path: string, name: string) => ({
    _tag: "exports" as const,
    path,
    name,
  }),
  scripts: (path: string, name: string) => ({
    _tag: "scripts" as const,
    path,
    name,
  }),
  dependencies: (path: string, dep: PlanningIntentPackageJsonDependency) => ({
    _tag: "dependencies" as const,
    path,
    section: dep.section,
    name: dep.name,
  }),
} as const;

const collectInvalidPackageJsonConflicts = (
  planningPath: PlanningIntentPath,
) => {
  const {
    path,
    exports: requiredExports,
    dependencies: requiredDependencies,
    scripts: requiredScripts,
  } = planningPath;
  return [
    ...Arr.map(requiredExports, (e) => planConflict.exports(path, e.name)),
    ...Arr.map(requiredDependencies, (d) => planConflict.dependencies(path, d)),
    ...Arr.map(requiredScripts, (s) => planConflict.scripts(path, s.name)),
  ];
};

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

const getExistingFileContents = (
  path: string,
  snapshotPath: SnapshotPath,
): string | undefined => {
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
