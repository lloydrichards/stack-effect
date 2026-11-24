import {
  CompositionOperation,
  PlanConflict,
  type PlanEntryClassification,
  PlanFailure,
  type PlanOutcome,
  type RepoSnapshotPath,
  RepositoryPath,
} from "@repo/domain/Plan";
import { Array as Arr, Effect, Match, Option, Predicate, Schema } from "effect";
import { findJsxSlotMarker, makeJsxSourceFile } from "./jsxSlot";

/** @internal */
export const PlanningIntentImport = Schema.Struct({
  moduleSpecifier: Schema.String,
  namedImports: Schema.Union([Schema.Array(Schema.String), Schema.Undefined]),
  defaultImport: Schema.Union([Schema.String, Schema.Undefined]),
  namespaceImport: Schema.Union([Schema.String, Schema.Undefined]),
});

/** @internal */
export type PlanningIntentImport = typeof PlanningIntentImport.Type;

const PlanningIntentComposition = Schema.Struct({
  targetVariable: Schema.String,
  functionName: Schema.String,
  argument: Schema.String,
  import: PlanningIntentImport,
});

const PlanningIntentObjectField = Schema.Struct({
  targetVariable: Schema.String,
  functionName: Schema.String,
  field: Schema.String,
  value: Schema.String,
  import: Schema.Union([PlanningIntentImport, Schema.Undefined]),
});

const PlanningIntentJsxSlot = Schema.Struct({
  slotId: Schema.String,
  content: Schema.String,
  import: Schema.Union([PlanningIntentImport, Schema.Undefined]),
});

type PlanningIntentJsxSlot = typeof PlanningIntentJsxSlot.Type;

const PlanningIntentNamedValue = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
});

const PlanningIntentPackageJsonDependency = Schema.Struct({
  section: Schema.Literals(["dependencies", "devDependencies"]),
  name: Schema.String,
  value: Schema.String,
});

type PlanningIntentPackageJsonDependency =
  typeof PlanningIntentPackageJsonDependency.Type;

/** Authoritative contents that a merge case writes before its operations when the path is missing. */
const PlanningIntentSeed = Schema.Union([Schema.String, Schema.Undefined]);

const PlanningIntentAuthoritativePath = Schema.TaggedStruct("authoritative", {
  path: RepositoryPath,
  contents: Schema.String,
});

/** Authoritative contents that must not replace a different existing file. */
const PlanningIntentConflictOnModifyPath = Schema.TaggedStruct(
  "conflictOnModify",
  {
    path: RepositoryPath,
    contents: Schema.String,
  },
);

const PlanningIntentPackageJsonPath = Schema.TaggedStruct("packageJson", {
  path: RepositoryPath,
  seed: PlanningIntentSeed,
  exports: Schema.Array(PlanningIntentNamedValue),
  dependencies: Schema.Array(PlanningIntentPackageJsonDependency),
  scripts: Schema.Array(PlanningIntentNamedValue),
});

type PlanningIntentPackageJsonPath = typeof PlanningIntentPackageJsonPath.Type;

const PlanningIntentBarrelPath = Schema.TaggedStruct("barrel", {
  path: RepositoryPath,
  seed: PlanningIntentSeed,
  exportPaths: Schema.Array(Schema.String),
});

type PlanningIntentBarrelPath = typeof PlanningIntentBarrelPath.Type;

const PlanningIntentTsCompositionPath = Schema.TaggedStruct("tsComposition", {
  path: RepositoryPath,
  seed: PlanningIntentSeed,
  compositions: Schema.Array(PlanningIntentComposition),
  objectFields: Schema.Array(PlanningIntentObjectField),
});

const PlanningIntentJsxSlotPath = Schema.TaggedStruct("jsxSlot", {
  path: RepositoryPath,
  seed: PlanningIntentSeed,
  jsxSlots: Schema.Array(PlanningIntentJsxSlot),
});

/**
 * The planning intent for one path, decided once from the contributions that target it.
 *
 * @internal
 */
export const PlanningIntentPath = Schema.Union([
  PlanningIntentAuthoritativePath,
  PlanningIntentConflictOnModifyPath,
  PlanningIntentPackageJsonPath,
  PlanningIntentBarrelPath,
  PlanningIntentTsCompositionPath,
  PlanningIntentJsxSlotPath,
]).pipe(Schema.toTaggedUnion("_tag"));

/** @internal */
export type PlanningIntentPath = typeof PlanningIntentPath.Type;

type PathAssessment = {
  readonly classification: PlanEntryClassification;
  readonly conflicts: ReadonlyArray<PlanConflict>;
};

type FlatStringRecordAssessment<Conflict> = {
  readonly conflicts: ReadonlyArray<Conflict>;
  readonly hasAdditions: boolean;
};

const generatedDenoTask =
  /^deno (?:(?:run (?:--watch )?)|compile )--allow-env --allow-net --allow-read --allow-write(?: --output dist\/[\w.-]+)? src\/index\.ts$/;

/** @internal */
export const preserveDenoSqlitePermissions = (
  planningPath: PlanningIntentPath,
  snapshotPath: RepoSnapshotPath | undefined,
): PlanningIntentPath => {
  if (
    planningPath._tag !== "packageJson" ||
    planningPath.scripts.length === 0 ||
    snapshotPath?._tag !== "file"
  ) {
    return planningPath;
  }

  const scripts = parseJsonRecord(snapshotPath.contents)?.["scripts"];
  if (!isFlatStringRecord(scripts)) return planningPath;

  // An incremental selection can omit the module that granted FFI. Preserve
  // the exact generated variant so unrelated manifest entries can still merge.
  return {
    ...planningPath,
    scripts: planningPath.scripts.map((entry) => {
      const existing = scripts[entry.name];
      return generatedDenoTask.test(entry.value) &&
        existing ===
          entry.value.replace("--allow-write", "--allow-write --allow-ffi")
        ? { ...entry, value: existing }
        : entry;
    }),
  };
};

/** @internal */
export const toPlannedFileOutcome = ({
  planningPath,
  classification,
}: {
  planningPath: PlanningIntentPath;
  classification: PlanEntryClassification;
}): PlanOutcome => {
  const complete = ({
    path,
    contents,
  }: {
    path: RepositoryPath;
    contents: string;
  }) => ({ _tag: "complete", path, classification, contents }) as const;
  const composed = (
    { path, seed }: { path: RepositoryPath; seed: string | undefined },
    operations: ReadonlyArray<CompositionOperation>,
  ) =>
    ({
      _tag: "composed",
      path,
      classification,
      seedContents: seed,
      operations,
    }) as const;

  return Match.valueTags(planningPath, {
    authoritative: complete,
    conflictOnModify: complete,
    packageJson: (intent) => composed(intent, packageJsonOperations(intent)),
    barrel: (intent) =>
      composed(
        intent,
        intent.exportPaths.map((moduleSpecifier) => ({
          _tag: "ts-add-reexport" as const,
          fileType: "typescript" as const,
          moduleSpecifier,
        })),
      ),
    tsComposition: (intent) =>
      composed(intent, [
        ...intent.compositions.flatMap((composition) => [
          importOperation(composition.import),
          {
            _tag: "ts-append-call-arg" as const,
            fileType: "typescript" as const,
            targetVariable: composition.targetVariable,
            functionName: composition.functionName,
            argument: composition.argument,
          },
        ]),
        ...intent.objectFields.flatMap((objectField) => [
          ...optionalImportOperation(objectField.import),
          {
            _tag: "ts-object-field" as const,
            fileType: "typescript" as const,
            targetVariable: objectField.targetVariable,
            functionName: objectField.functionName,
            field: objectField.field,
            value: objectField.value,
          },
        ]),
      ]),
    jsxSlot: (intent) =>
      composed(
        intent,
        intent.jsxSlots.flatMap((jsxSlot) => [
          ...optionalImportOperation(jsxSlot.import),
          {
            _tag: "ts-jsx-slot" as const,
            fileType: "typescript" as const,
            slotId: jsxSlot.slotId,
            content: jsxSlot.content,
          },
        ]),
      ),
  });
};

const packageJsonOperations = (
  intent: PlanningIntentPackageJsonPath,
): Array<CompositionOperation> => {
  const operations: Array<CompositionOperation> = [];

  if (intent.exports.length > 0) {
    operations.push({
      _tag: "json-pkg-exports",
      fileType: "json",
      entries: intent.exports.map(({ name, value }) => ({ name, value })),
    });
  }

  for (const section of ["dependencies", "devDependencies"] as const) {
    const deps = intent.dependencies.filter((d) => d.section === section);
    if (deps.length === 0) continue;
    operations.push({
      _tag: "json-pkg-deps",
      fileType: "json",
      section,
      entries: deps.map(({ name, value }) => ({ name, value })),
    });
  }

  if (intent.scripts.length > 0) {
    operations.push({
      _tag: "json-pkg-scripts",
      fileType: "json",
      entries: intent.scripts,
    });
  }

  return operations;
};

const importOperation = (
  planningImport: PlanningIntentImport,
): CompositionOperation => ({
  _tag: "ts-add-import",
  fileType: "typescript",
  moduleSpecifier: planningImport.moduleSpecifier,
  namedImports: planningImport.namedImports,
  defaultImport: planningImport.defaultImport,
  namespaceImport: planningImport.namespaceImport,
});

const optionalImportOperation = (
  planningImport: PlanningIntentImport | undefined,
) => (planningImport === undefined ? [] : [importOperation(planningImport)]);

/** @internal */
export const assess = Effect.fnUntraced(function* ({
  planningPath,
  snapshotPath,
}: {
  planningPath: PlanningIntentPath;
  snapshotPath: RepoSnapshotPath | undefined;
}) {
  const existingContents = yield* getExistingFileContents(
    planningPath.path,
    snapshotPath,
  );

  return Match.valueTags(planningPath, {
    authoritative: (intent) => assessContents(intent, existingContents),
    conflictOnModify: (intent) => {
      const assessment = assessContents(intent, existingContents);
      return assessment.classification === "modify"
        ? createPathAssessment({
            classification: "conflict",
            conflicts: [planConflict.tsconfig(intent.path)],
          })
        : assessment;
    },
    packageJson: (intent) => assessPackageJson(intent, existingContents),
    barrel: (intent) => assessBarrel(intent, existingContents),
    tsComposition: (intent) =>
      assessTypeScriptTarget({
        intent,
        jsxSlots: [],
        missingTargetConflicts: intent.compositions.map((composition) =>
          planConflict.compositionTargetNotFound(
            intent.path,
            composition.targetVariable,
            composition.functionName,
          ),
        ),
        existingContents,
      }),
    jsxSlot: (intent) =>
      assessTypeScriptTarget({
        intent,
        jsxSlots: intent.jsxSlots,
        missingTargetConflicts: collectMissingJsxSlotConflicts(
          intent.path,
          intent.jsxSlots,
          undefined,
        ),
        existingContents,
      }),
  });
});

/** @internal */
export const collectAncestorPaths = (
  path: RepositoryPath,
): ReadonlyArray<RepositoryPath> => {
  const parts = path.split("/");
  return parts
    .slice(0, -1)
    .map((_, index) =>
      RepositoryPath.make(parts.slice(0, index + 1).join("/")),
    );
};

const createPathAssessment = ({
  classification,
  conflicts = [],
}: {
  classification: PlanEntryClassification;
  conflicts?: ReadonlyArray<PlanConflict>;
}): PathAssessment => ({
  classification,
  conflicts: [...conflicts],
});

const assessContents = (
  { contents }: { contents: string },
  existingContents: string | undefined,
) => {
  if (existingContents === undefined) {
    return createPathAssessment({ classification: "create" });
  }

  if (existingContents === contents) {
    return createPathAssessment({ classification: "unchanged" });
  }

  return createPathAssessment({ classification: "modify" });
};

/**
 * Detects conflicts when the existing package.json has conflicting entries.
 * A seeded path is unchanged only when the existing file also matches its seed.
 */
const assessPackageJson = (
  intent: PlanningIntentPackageJsonPath,
  existingContents: string | undefined,
): PathAssessment => {
  if (existingContents === undefined) {
    return createPathAssessment({ classification: "create" });
  }

  const packageJson = parseJsonRecord(existingContents);

  if (packageJson === undefined) {
    return createPathAssessment({
      classification: "conflict",
      conflicts: collectInvalidPackageJsonConflicts(intent),
    });
  }

  const { conflicts, hasAdditions } = assessPackageJsonEntries({
    packageJson,
    intent,
  });

  if (conflicts.length > 0) {
    return createPathAssessment({
      classification: "conflict",
      conflicts,
    });
  }

  const matchesSeed =
    intent.seed === undefined || existingContents === intent.seed;

  return createPathAssessment({
    classification: matchesSeed && !hasAdditions ? "unchanged" : "modify",
  });
};

/**
 * Appends re-exports to a simple barrel. A seeded path is unchanged only when
 * the existing barrel already re-exports its seed's single export.
 */
const assessBarrel = (
  intent: PlanningIntentBarrelPath,
  existingContents: string | undefined,
): PathAssessment => {
  if (existingContents === undefined) {
    return createPathAssessment({ classification: "create" });
  }

  const existingExports = parseSimpleBarrelExports(existingContents);

  if (existingExports === undefined) {
    return createPathAssessment({
      classification: "conflict",
      conflicts: intent.exportPaths.map((exportPath) =>
        planConflict.barrelExport(intent.path, exportPath),
      ),
    });
  }

  const existingExportsSet = new Set(existingExports);
  const hasAdditions = intent.exportPaths.some(
    (exportPath) => !existingExportsSet.has(exportPath),
  );
  const seedExportPath = intent.seed?.match(simpleBarrelExportPattern)?.[1];
  const hasSeedExport =
    seedExportPath === undefined || existingExportsSet.has(seedExportPath);

  return createPathAssessment({
    classification: hasSeedExport && !hasAdditions ? "unchanged" : "modify",
  });
};

/**
 * Compositions target an existing file unless a seed creates it. Apply
 * validates the concrete TypeScript composition target with ts-morph.
 */
const assessTypeScriptTarget = ({
  intent,
  jsxSlots,
  missingTargetConflicts,
  existingContents,
}: {
  intent: { path: RepositoryPath; seed: string | undefined };
  jsxSlots: ReadonlyArray<PlanningIntentJsxSlot>;
  missingTargetConflicts: ReadonlyArray<PlanConflict>;
  existingContents: string | undefined;
}): PathAssessment => {
  if (existingContents === undefined) {
    return intent.seed === undefined
      ? createPathAssessment({
          classification: "conflict",
          conflicts: missingTargetConflicts,
        })
      : createPathAssessment({ classification: "create" });
  }

  const jsxSlotConflicts = collectMissingJsxSlotConflicts(
    intent.path,
    jsxSlots,
    existingContents,
  );

  if (jsxSlotConflicts.length > 0) {
    return createPathAssessment({
      classification: "conflict",
      conflicts: jsxSlotConflicts,
    });
  }

  return createPathAssessment({ classification: "modify" });
};

const collectMissingJsxSlotConflicts = (
  path: RepositoryPath,
  jsxSlots: ReadonlyArray<PlanningIntentJsxSlot>,
  contents: string | undefined,
) => {
  const sourceFile =
    contents === undefined ? undefined : makeJsxSourceFile(contents);

  return jsxSlots.flatMap(({ slotId }) =>
    sourceFile !== undefined &&
    findJsxSlotMarker(sourceFile, slotId) !== undefined
      ? []
      : [planConflict.jsxSlotTargetNotFound(path, slotId)],
  );
};

const parseSimpleBarrelExports = (contents: string) => {
  const parsedExports = contents
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .map((line) => line.match(simpleBarrelExportPattern)?.[1]);

  return parsedExports.every(Predicate.isNotUndefined)
    ? parsedExports
    : undefined;
};

const simpleBarrelExportPattern = /^export \* from "(\.[^"]*)";$/;

const planConflict = {
  tsconfig: (path: RepositoryPath) =>
    PlanConflict.cases.tsconfig.make({ path }),
  barrelExport: (path: RepositoryPath, exportPath: string) =>
    PlanConflict.cases.barrelExport.make({ path, exportPath }),
  exports: (path: RepositoryPath, name: string) =>
    PlanConflict.cases.exports.make({ path, name }),
  scripts: (path: RepositoryPath, name: string) =>
    PlanConflict.cases.scripts.make({ path, name }),
  dependencies: (
    path: RepositoryPath,
    dep: PlanningIntentPackageJsonDependency,
  ) =>
    PlanConflict.cases.dependencies.make({
      path,
      section: dep.section,
      name: dep.name,
    }),
  compositionTargetNotFound: (
    path: RepositoryPath,
    targetVariable: string,
    functionName: string,
  ) =>
    PlanConflict.cases.compositionTargetNotFound.make({
      path,
      targetVariable,
      functionName,
    }),
  jsxSlotTargetNotFound: (path: RepositoryPath, slotId: string) =>
    PlanConflict.cases.jsxSlotTargetNotFound.make({ path, slotId }),
} as const;

const collectInvalidPackageJsonConflicts = (
  intent: PlanningIntentPackageJsonPath,
) => {
  const {
    path,
    exports: requiredExports,
    dependencies: requiredDependencies,
    scripts: requiredScripts,
  } = intent;
  return [
    ...requiredExports.map((e) => planConflict.exports(path, e.name)),
    ...requiredDependencies.map((d) => planConflict.dependencies(path, d)),
    ...requiredScripts.map((s) => planConflict.scripts(path, s.name)),
  ];
};

const assessPackageJsonEntries = ({
  packageJson,
  intent,
}: {
  packageJson: Record<string, unknown>;
  intent: PlanningIntentPackageJsonPath;
}): FlatStringRecordAssessment<PlanConflict> => {
  const { path } = intent;
  const dependenciesBySection = Arr.groupBy(
    intent.dependencies,
    (plannedDependency) => plannedDependency.section,
  );
  const exportAssessment = assessFlatStringRecordEntries({
    existingValue: packageJson["exports"],
    requiredEntries: intent.exports,
    keyOf: (plannedExport) => plannedExport.name,
    valueOf: (plannedExport) => plannedExport.value,
    toConflict: (plannedExport) =>
      planConflict.exports(path, plannedExport.name),
  });
  const dependencyAssessments = (
    ["dependencies", "devDependencies"] as const
  ).flatMap((section) => {
    const sectionDependencies = dependenciesBySection[section];
    return sectionDependencies === undefined
      ? []
      : [
          assessFlatStringRecordEntries({
            existingValue: packageJson[section],
            requiredEntries: sectionDependencies,
            keyOf: (plannedDependency) => plannedDependency.name,
            valueOf: (plannedDependency) => plannedDependency.value,
            toConflict: (plannedDependency) =>
              planConflict.dependencies(path, plannedDependency),
          }),
        ];
  });
  const scriptAssessment = assessFlatStringRecordEntries({
    existingValue: packageJson["scripts"],
    requiredEntries: intent.scripts,
    keyOf: (script) => script.name,
    valueOf: (script) => script.value,
    toConflict: (script) => planConflict.scripts(path, script.name),
  });

  return {
    conflicts: [
      ...exportAssessment.conflicts,
      ...dependencyAssessments.flatMap((assessment) => assessment.conflicts),
      ...scriptAssessment.conflicts,
    ],
    hasAdditions:
      exportAssessment.hasAdditions ||
      dependencyAssessments.some((assessment) => assessment.hasAdditions) ||
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
      conflicts: requiredEntries.map(toConflict),
      hasAdditions: false,
    };
  }

  const existingEntries = existingValue ?? {};
  // Read own keys only, so an entry named after an Object.prototype member
  // such as `__proto__` counts as absent.
  const existingEntryOf = (entry: Entry) =>
    Object.hasOwn(existingEntries, keyOf(entry))
      ? existingEntries[keyOf(entry)]
      : undefined;
  const conflicts = requiredEntries.flatMap((entry) => {
    const existingEntry = existingEntryOf(entry);

    return existingEntry === undefined || existingEntry === valueOf(entry)
      ? []
      : [toConflict(entry)];
  });

  return {
    conflicts,
    hasAdditions: requiredEntries.some(
      (entry) => existingEntryOf(entry) === undefined,
    ),
  };
};

const isFlatStringRecord = (value: unknown): value is Record<string, string> =>
  Predicate.isReadonlyObject(value) &&
  Object.values(value).every((entry) => typeof entry === "string");

const parseJsonRecord = (
  contents: string,
): Record<string, unknown> | undefined =>
  Option.getOrUndefined(
    Schema.decodeOption(
      Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
    )(contents),
  );

const getExistingFileContents = (
  path: RepositoryPath,
  snapshotPath: RepoSnapshotPath | undefined,
) =>
  snapshotPath === undefined
    ? Effect.undefined
    : Match.valueTags(snapshotPath, {
        missing: () => Effect.undefined,
        file: ({ contents }) => Effect.succeed(contents),
        directory: () =>
          Effect.fail(
            new PlanFailure({
              message: `Expected ${path} to be a file during planning.`,
            }),
          ),
      });
