import {
  CompositionOperation,
  Plan,
  PlanConflict,
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
    readonly namespaceImport: string | undefined;
  };
};

export type PlanningIntentObjectField = {
  readonly targetVariable: string;
  readonly functionName: string;
  readonly field: string;
  readonly value: string;
  readonly import:
    | {
        readonly moduleSpecifier: string;
        readonly namedImports: ReadonlyArray<string> | undefined;
        readonly defaultImport: string | undefined;
        readonly namespaceImport: string | undefined;
      }
    | undefined;
};

export type PlanningIntentJsxSlot = {
  readonly slotId: string;
  readonly content: string;
  readonly import:
    | {
        readonly moduleSpecifier: string;
        readonly namedImports: ReadonlyArray<string> | undefined;
        readonly defaultImport: string | undefined;
        readonly namespaceImport: string | undefined;
      }
    | undefined;
};

export type PlanningIntentPath = {
  readonly path: string;
  readonly contents: string | undefined;
  readonly exports: ReadonlyArray<{ name: string; value: string }>;
  readonly dependencies: ReadonlyArray<PlanningIntentPackageJsonDependency>;
  readonly scripts: ReadonlyArray<{ name: string; value: string }>;
  readonly barrelExports: ReadonlyArray<{ exportPath: string }>;
  readonly compositions: ReadonlyArray<PlanningIntentComposition>;
  readonly objectFields: ReadonlyArray<PlanningIntentObjectField>;
  readonly jsxSlots: ReadonlyArray<PlanningIntentJsxSlot>;
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

function toCompositionOperations(
  planningPath: PlanningIntentPath,
): Array<typeof CompositionOperation.Type> {
  const operations: Array<typeof CompositionOperation.Type> = [];

  if (planningPath.exports.length > 0) {
    operations.push({
      _tag: "json-pkg-exports",
      fileType: "json",
      entries: planningPath.exports.map(({ name, value }) => ({ name, value })),
    });
  }

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

  if (planningPath.scripts.length > 0) {
    operations.push({
      _tag: "json-pkg-scripts",
      fileType: "json",
      entries: planningPath.scripts.map(({ name, value }) => ({ name, value })),
    });
  }

  for (const { exportPath } of planningPath.barrelExports) {
    operations.push({
      _tag: "ts-add-reexport",
      fileType: "typescript",
      moduleSpecifier: exportPath,
    });
  }

  for (const composition of planningPath.compositions) {
    operations.push({
      _tag: "ts-add-import",
      fileType: "typescript",
      moduleSpecifier: composition.import.moduleSpecifier,
      namedImports: composition.import.namedImports,
      defaultImport: composition.import.defaultImport,
      namespaceImport: composition.import.namespaceImport,
    });

    operations.push({
      _tag: "ts-append-call-arg",
      fileType: "typescript",
      targetVariable: composition.targetVariable,
      functionName: composition.functionName,
      argument: composition.argument,
    });
  }

  for (const objectField of planningPath.objectFields) {
    if (objectField.import) {
      operations.push({
        _tag: "ts-add-import",
        fileType: "typescript",
        moduleSpecifier: objectField.import.moduleSpecifier,
        namedImports: objectField.import.namedImports,
        defaultImport: objectField.import.defaultImport,
        namespaceImport: objectField.import.namespaceImport,
      });
    }

    operations.push({
      _tag: "ts-object-field",
      fileType: "typescript",
      targetVariable: objectField.targetVariable,
      functionName: objectField.functionName,
      field: objectField.field,
      value: objectField.value,
    });
  }

  for (const jsxSlot of planningPath.jsxSlots) {
    if (jsxSlot.import) {
      operations.push({
        _tag: "ts-add-import",
        fileType: "typescript",
        moduleSpecifier: jsxSlot.import.moduleSpecifier,
        namedImports: jsxSlot.import.namedImports,
        defaultImport: jsxSlot.import.defaultImport,
        namespaceImport: jsxSlot.import.namespaceImport,
      });
    }

    operations.push({
      _tag: "ts-jsx-slot",
      fileType: "typescript",
      slotId: jsxSlot.slotId,
      content: jsxSlot.content,
    });
  }

  return operations;
}

function assessPlanningPath({
  planningPath,
  snapshotPath,
}: {
  planningPath: PlanningIntentPath;
  snapshotPath: typeof RepoSnapshot.fields.paths.value.Type | undefined;
}): PathAssessment {
  const hasContents = planningPath.contents !== undefined;
  const hasPackageJsonFields =
    planningPath.exports.length > 0 ||
    planningPath.dependencies.length > 0 ||
    planningPath.scripts.length > 0;
  const hasBarrelExports = planningPath.barrelExports.length > 0;
  const hasTsconfig = planningPath.tsconfig !== undefined;
  const hasCompositions =
    planningPath.compositions.length > 0 ||
    planningPath.objectFields.length > 0;

  return Match.value({
    hasContents,
    hasPackageJsonFields,
    hasBarrelExports,
    hasTsconfig,
    hasCompositions,
  }).pipe(
    // NOTE: Authoritative content paired with merge operations is planned before pure merge families.
    Match.when({ hasContents: true, hasBarrelExports: true }, () =>
      assessBarrelMerge(planningPath, snapshotPath),
    ),
    Match.when({ hasContents: true, hasCompositions: true }, () =>
      assessCompositionMerge(planningPath, snapshotPath),
    ),
    Match.when({ hasContents: true, hasPackageJsonFields: true }, () =>
      assessPackageJsonMerge(planningPath, snapshotPath),
    ),
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

type SnapshotPath = typeof RepoSnapshot.fields.paths.value.Type | undefined;

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
  const { path } = planningPath;
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

  const { conflicts, hasAdditions } = assessPackageJsonEntries({
    packageJson,
    planningPath,
  });

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

  // NOTE: Apply validates the concrete TypeScript composition target with ts-morph.
  return createPathAssessment({ classification: "modify" });
};

/**
 * Plan authoritative barrel merge: seed content + barrel exports.
 * Creates file with authoritative content, then appends barrel exports.
 */
const assessBarrelMerge = (
  planningPath: PlanningIntentPath,
  snapshotPath: SnapshotPath,
): PathAssessment => {
  const existingContents = getExistingFileContents(
    planningPath.path,
    snapshotPath,
  );
  const requiredContents = planningPath.contents!;

  if (existingContents === undefined) {
    return createPathAssessment({ classification: "create" });
  }

  const existingExports = parseSimpleBarrelExports(existingContents);

  if (existingExports !== undefined) {
    const existingExportsSet = new Set(existingExports);
    const hasBarrelAdditions = Arr.some(
      planningPath.barrelExports,
      (plannedReExport) => !existingExportsSet.has(plannedReExport.exportPath),
    );

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
const assessCompositionMerge = (
  planningPath: PlanningIntentPath,
  snapshotPath: SnapshotPath,
): PathAssessment => {
  const existingContents = getExistingFileContents(
    planningPath.path,
    snapshotPath,
  );

  if (existingContents === undefined) {
    return createPathAssessment({ classification: "create" });
  }

  return createPathAssessment({ classification: "modify" });
};

/**
 * Plan authoritative package.json merge: seed content + package.json fields.
 * Creates file with authoritative content, then applies package.json field operations.
 * Detects conflicts when existing package.json has conflicting entries.
 */
const assessPackageJsonMerge = (
  planningPath: PlanningIntentPath,
  snapshotPath: SnapshotPath,
): PathAssessment => {
  const { path } = planningPath;
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

  const { conflicts, hasAdditions } = assessPackageJsonEntries({
    packageJson,
    planningPath,
  });

  if (conflicts.length > 0) {
    return createPathAssessment({
      classification: "conflict",
      conflicts,
    });
  }

  const requiredContents = planningPath.contents!;
  const authoritativeContentMatches = existingContents === requiredContents;

  if (authoritativeContentMatches && !hasAdditions) {
    return createPathAssessment({ classification: "unchanged" });
  }

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
  tsconfig: (path: string) => PlanConflict.cases.tsconfig.make({ path }),
  barrelExport: (path: string, exportPath: string) =>
    PlanConflict.cases.barrelExport.make({ path, exportPath }),
  exports: (path: string, name: string) =>
    PlanConflict.cases.exports.make({ path, name }),
  scripts: (path: string, name: string) =>
    PlanConflict.cases.scripts.make({ path, name }),
  dependencies: (path: string, dep: PlanningIntentPackageJsonDependency) =>
    PlanConflict.cases.dependencies.make({
      path,
      section: dep.section,
      name: dep.name,
    }),
  compositionTargetNotFound: (
    path: string,
    targetVariable: string,
    functionName: string,
  ) =>
    PlanConflict.cases.compositionTargetNotFound.make({
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

const assessPackageJsonEntries = ({
  packageJson,
  planningPath,
}: {
  packageJson: Record<string, unknown>;
  planningPath: PlanningIntentPath;
}): FlatStringRecordAssessment<typeof PlanConflict.Type> => {
  const { path } = planningPath;
  const dependenciesBySection = Arr.groupBy(
    planningPath.dependencies,
    (plannedDependency) => plannedDependency.section,
  );
  const exportAssessment = assessFlatStringRecordEntries({
    existingValue: packageJson["exports"],
    requiredEntries: planningPath.exports,
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
    requiredEntries: planningPath.scripts,
    keyOf: (script) => script.name,
    valueOf: (script) => script.value,
    toConflict: (script) => planConflict.scripts(path, script.name),
  });

  return {
    conflicts: [
      ...exportAssessment.conflicts,
      ...Arr.flatMap(
        dependencyAssessments,
        (assessment) => assessment.conflicts,
      ),
      ...scriptAssessment.conflicts,
    ],
    hasAdditions:
      exportAssessment.hasAdditions ||
      Arr.some(
        dependencyAssessments,
        (assessment) => assessment.hasAdditions,
      ) ||
      scriptAssessment.hasAdditions,
  };
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
  Arr.every(Object.values(value), (entry) => typeof entry === "string");

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
