import {
  CompositionOperation,
  Plan,
  type PlanEntryClassification,
  PlanFailure,
  type PlanOutcome,
  type RepoSnapshot,
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

export type PlanningIntentComposition = {
  readonly targetVariable: string;
  readonly functionName: string;
  readonly argument: string;
  readonly import: {
    readonly moduleSpecifier: string;
    readonly namedImports: ReadonlyArray<string> | undefined;
    readonly defaultImport: string | undefined;
  };
};

export type PlanningIntentPath = {
  readonly path: string;
  readonly contents: string | undefined;
  readonly exports: ReadonlyArray<{ name: string; value: string }>;
  readonly dependencies: ReadonlyArray<PlanningIntentPackageJsonDependency>;
  readonly scripts: ReadonlyArray<{ name: string; value: string }>;
  readonly barrelExports: ReadonlyArray<{ exportPath: string }>;
  readonly compositions: ReadonlyArray<PlanningIntentComposition>;
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
}): typeof PlanOutcome.Type {
  const operations = toCompositionOperations(planningPath);
  const hasOperations = operations.length > 0;
  const contents =
    planningPath.contents ?? planningPath.tsconfig?.contents ?? undefined;

  return Match.value({
    hasContents: contents !== undefined,
    hasOperations,
  }).pipe(
    Match.when({ hasContents: true, hasOperations: true }, () => ({
      _tag: "composed" as const,
      path: planningPath.path,
      classification,
      seedContents: contents!,
      operations,
    })),
    Match.when({ hasContents: true, hasOperations: false }, () => ({
      _tag: "complete" as const,
      path: planningPath.path,
      classification,
      contents: contents!,
    })),
    Match.when({ hasContents: false, hasOperations: true }, () => ({
      _tag: "composed" as const,
      path: planningPath.path,
      classification,
      operations,
    })),
    Match.when({ hasContents: false, hasOperations: false }, () => {
      throw new PlanFailure({
        reason: "invalidPlanIntent",
        message: `No planned outcome could be derived for ${planningPath.path}.`,
      });
    }),
    Match.exhaustive,
  );
}

/**
 * Convert planning path structural data into composition operations
 */
function toCompositionOperations(
  planningPath: PlanningIntentPath,
): Array<typeof CompositionOperation.Type> {
  const operations: Array<typeof CompositionOperation.Type> = [];

  // Package.json exports -> json-pkg-exports
  if (planningPath.exports.length > 0) {
    operations.push({
      _tag: "json-pkg-exports",
      fileType: "json",
      entries: planningPath.exports.map(({ name, value }) => ({ name, value })),
    });
  }

  // Package.json dependencies -> json-pkg-deps (grouped by section)
  const depsBySection = Arr.groupBy(
    planningPath.dependencies,
    (d) => d.section,
  );
  for (const [section, deps] of Object.entries(depsBySection)) {
    operations.push({
      _tag: "json-pkg-deps",
      fileType: "json",
      section: section as "dependencies" | "devDependencies",
      entries: deps.map(({ name, value }) => ({ name, value })),
    });
  }

  // Package.json scripts -> json-pkg-scripts
  if (planningPath.scripts.length > 0) {
    operations.push({
      _tag: "json-pkg-scripts",
      fileType: "json",
      entries: planningPath.scripts.map(({ name, value }) => ({ name, value })),
    });
  }

  // Barrel exports -> ts-add-reexport
  for (const { exportPath } of planningPath.barrelExports) {
    operations.push({
      _tag: "ts-add-reexport",
      fileType: "typescript",
      moduleSpecifier: exportPath,
    });
  }

  // Compositions -> ts-add-import + ts-append-call-arg
  for (const composition of planningPath.compositions) {
    // Add import for the composed argument
    operations.push({
      _tag: "ts-add-import",
      fileType: "typescript",
      moduleSpecifier: composition.import.moduleSpecifier,
      namedImports: composition.import.namedImports,
      defaultImport: composition.import.defaultImport,
    });

    // Append argument to the function call
    operations.push({
      _tag: "ts-append-call-arg",
      fileType: "typescript",
      targetVariable: composition.targetVariable,
      functionName: composition.functionName,
      argument: composition.argument,
    });
  }

  return operations;
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
  const hasCompositions = planningPath.compositions.length > 0;

  return Match.value({
    hasContents,
    hasPackageJsonFields,
    hasBarrelExports,
    hasTsconfig,
    hasCompositions,
  }).pipe(
    // Combined cases first (authoritative + something else)
    Match.when({ hasContents: true, hasBarrelExports: true }, () =>
      planAuthoritativeBarrelMerge(planningPath, snapshotPath),
    ),
    Match.when({ hasContents: true, hasCompositions: true }, () =>
      planAuthoritativeCompositionMerge(planningPath, snapshotPath),
    ),
    // Pure single-family cases
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
    Match.when({ hasCompositions: true }, () =>
      planCompositionMerge(planningPath, snapshotPath),
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

/**
 * Plan composition merge for TypeScript files with composition points.
 * Compositions always target existing files - if file doesn't exist, it's a conflict.
 * The actual composition target validation happens at apply time via ts-morph.
 */
const planCompositionMerge = (
  planningPath: PlanningIntentPath,
  snapshotPath: SnapshotPath,
): PathAssessment => {
  const existingContents = getExistingFileContents(
    planningPath.path,
    snapshotPath,
  );

  // Compositions require an existing file with composition points
  if (existingContents === undefined) {
    return createPathAssessment({
      classification: "conflict",
      conflicts: Arr.map(planningPath.compositions, (composition) =>
        planConflict.compositionTargetNotFound(
          planningPath.path,
          composition.targetVariable,
          composition.functionName,
        ),
      ),
    });
  }

  // File exists - mark as modify, actual target validation happens at apply time
  return createPathAssessment({ classification: "modify" });
};

/**
 * Plan authoritative barrel merge: seed content + barrel exports.
 * Creates file with authoritative content, then appends barrel exports.
 */
const planAuthoritativeBarrelMerge = (
  planningPath: PlanningIntentPath,
  snapshotPath: SnapshotPath,
): PathAssessment => {
  const existingContents = getExistingFileContents(
    planningPath.path,
    snapshotPath,
  );
  const requiredContents = planningPath.contents!;

  // File doesn't exist - create with authoritative content + barrel exports
  if (existingContents === undefined) {
    return createPathAssessment({ classification: "create" });
  }

  // File exists - check if authoritative content matches and parse for barrel exports
  const existingExports = parseSimpleBarrelExports(existingContents);

  // If we can parse the existing barrel exports, check for new additions
  if (existingExports !== undefined) {
    const existingExportsSet = new Set(existingExports);
    const hasBarrelAdditions = Arr.some(
      planningPath.barrelExports,
      (plannedReExport) => !existingExportsSet.has(plannedReExport.exportPath),
    );

    // Check if the authoritative export is present
    const authoritativeExportMatch = requiredContents.match(
      simpleBarrelExportPattern,
    );
    const authoritativeExportPath = authoritativeExportMatch?.[1];
    const hasAuthoritativeExport =
      authoritativeExportPath === undefined ||
      existingExportsSet.has(authoritativeExportPath);

    if (hasAuthoritativeExport && !hasBarrelAdditions) {
      return createPathAssessment({ classification: "unchanged" });
    }

    return createPathAssessment({ classification: "modify" });
  }

  // Can't parse as barrel - conflict on barrel exports
  const conflicts = Arr.map(planningPath.barrelExports, (plannedReExport) =>
    planConflict.barrelExport(planningPath.path, plannedReExport.exportPath),
  );

  return createPathAssessment({
    classification: "conflict",
    conflicts,
  });
};

/**
 * Plan authoritative composition merge: seed content + compositions.
 * Creates file with authoritative content, then applies composition operations.
 */
const planAuthoritativeCompositionMerge = (
  planningPath: PlanningIntentPath,
  snapshotPath: SnapshotPath,
): PathAssessment => {
  const existingContents = getExistingFileContents(
    planningPath.path,
    snapshotPath,
  );
  const requiredContents = planningPath.contents!;

  // File doesn't exist - create with authoritative content + compositions
  if (existingContents === undefined) {
    return createPathAssessment({ classification: "create" });
  }

  // File exists - always mark as modify since we need to apply compositions
  // The authoritative content check could differ, but compositions still need applying
  if (existingContents !== requiredContents) {
    return createPathAssessment({ classification: "modify" });
  }

  // Contents match but we have compositions to apply
  return createPathAssessment({ classification: "modify" });
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
  compositionTargetNotFound: (
    path: string,
    targetVariable: string,
    functionName: string,
  ) => ({
    _tag: "compositionTargetNotFound" as const,
    path,
    targetVariable,
    functionName,
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
