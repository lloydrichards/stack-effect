import {
  type CompositionOperation,
  PlanConflict,
  type PlanEntryClassification,
  PlanError,
  PlanOutcome,
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

type PlanningIntentComposition = typeof PlanningIntentComposition.Type;

const PlanningIntentObjectField = Schema.Struct({
  targetVariable: Schema.String,
  functionName: Schema.String,
  field: Schema.String,
  value: Schema.String,
  import: Schema.Union([PlanningIntentImport, Schema.Undefined]),
});

type PlanningIntentObjectField = typeof PlanningIntentObjectField.Type;

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
  PlanningIntentTsCompositionPath,
  PlanningIntentJsxSlotPath,
]).pipe(Schema.toTaggedUnion("_tag"));

/** @internal */
export type PlanningIntentPath = typeof PlanningIntentPath.Type;

type PathAssessment = {
  classification: PlanEntryClassification;
  conflicts: ReadonlyArray<PlanConflict>;
};

type FlatStringRecordAssessment = {
  conflicts: ReadonlyArray<PlanConflict>;
  hasAdditions: boolean;
};

const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies"] as const;

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

const publishableBuild = "node scripts/clean.mjs && tsc -p tsconfig.build.json";
const packagedBuildOutput = ["dist", "dist/", "dist/**/*.js"] as const;
const sourceExport = /^\.\/src\/([\w./-]+)\.ts$/;

/** @internal */
export const compiledExportConfigPath = (intent: PlanningIntentPath) =>
  intent._tag === "packageJson" &&
  intent.exports.some(({ value }) => sourceExport.test(value))
    ? RepositoryPath.make(
        intent.path.replace(/package\.json$/u, "tsconfig.build.json"),
      )
    : undefined;

/** @internal */
export const useCompiledPackageExports = Effect.fnUntraced(function* (
  intent: PlanningIntentPath,
  snapshotPath: RepoSnapshotPath | undefined,
  buildConfig: RepoSnapshotPath | undefined,
) {
  if (
    intent._tag !== "packageJson" ||
    snapshotPath?._tag !== "file" ||
    compiledExportConfigPath(intent) === undefined
  )
    return intent;

  const manifest = parseJsonRecord(snapshotPath.contents);
  const files = manifest?.["files"];
  const scripts = manifest?.["scripts"];
  if (
    !Array.isArray(files) ||
    !packagedBuildOutput.some((entry) => files.includes(entry)) ||
    !isFlatStringRecord(scripts) ||
    scripts["build"] !== publishableBuild
  )
    return intent;

  const exclusions = files.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.startsWith("!"),
  );
  if (
    exclusions.length > 0 &&
    exclusions.every(
      (entry) => entry === "!dist" || entry.startsWith("!dist/"),
    ) &&
    (files.includes("src") || files.includes("src/"))
  )
    return intent;

  const options =
    buildConfig?._tag === "file"
      ? parseJsonRecord(buildConfig.contents)?.["compilerOptions"]
      : undefined;
  if (
    exclusions.length > 0 ||
    !Predicate.isReadonlyObject(options) ||
    options["outDir"] !== "dist" ||
    (options["rootDir"] !== "src" && options["rootDir"] !== ".") ||
    options["noEmit"] !== false ||
    options["emitDeclarationOnly"] === true
  ) {
    return yield* new PlanError({
      message: `Cannot infer compiled exports for ${intent.path}. Use the generated Publishable Library build and pack layout, or add the module and its export manually.`,
    });
  }

  const sourceDirectory = options["rootDir"] === "." ? "src/" : "";
  return {
    ...intent,
    exports: intent.exports.map((entry) => {
      const source = sourceExport.exec(entry.value)?.[1];
      return source === undefined ||
        source.endsWith(".test") ||
        source.endsWith(".d")
        ? entry
        : { ...entry, value: `./dist/${sourceDirectory}${source}.js` };
    }),
  };
});

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

const appendCallArgOperation = (
  composition: PlanningIntentComposition,
): CompositionOperation => ({
  _tag: "ts-append-call-arg",
  fileType: "typescript",
  targetVariable: composition.targetVariable,
  functionName: composition.functionName,
  argument: composition.argument,
});

const objectFieldOperation = (
  objectField: PlanningIntentObjectField,
): CompositionOperation => ({
  _tag: "ts-object-field",
  fileType: "typescript",
  targetVariable: objectField.targetVariable,
  functionName: objectField.functionName,
  field: objectField.field,
  value: objectField.value,
});

const jsxSlotOperation = (
  jsxSlot: PlanningIntentJsxSlot,
): CompositionOperation => ({
  _tag: "ts-jsx-slot",
  fileType: "typescript",
  slotId: jsxSlot.slotId,
  content: jsxSlot.content,
});

const nonEmptyOperation = (
  operation: CompositionOperation & { entries: ReadonlyArray<unknown> },
) => (operation.entries.length === 0 ? [] : [operation]);

const packageJsonOperations = (intent: PlanningIntentPackageJsonPath) => [
  ...nonEmptyOperation({
    _tag: "json-pkg-exports",
    fileType: "json",
    entries: intent.exports.map(({ name, value }) => ({ name, value })),
  }),
  ...DEPENDENCY_SECTIONS.flatMap((section) =>
    nonEmptyOperation({
      _tag: "json-pkg-deps",
      fileType: "json",
      section,
      entries: intent.dependencies
        .filter((dependency) => dependency.section === section)
        .map(({ name, value }) => ({ name, value })),
    }),
  ),
  ...nonEmptyOperation({
    _tag: "json-pkg-scripts",
    fileType: "json",
    entries: intent.scripts,
  }),
];

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
  }) => PlanOutcome.cases.complete.make({ path, classification, contents });
  const composed = (
    { path, seed }: { path: RepositoryPath; seed: string | undefined },
    operations: ReadonlyArray<CompositionOperation>,
  ) =>
    PlanOutcome.cases.composed.make({
      path,
      classification,
      seedContents: seed,
      operations,
    });

  return Match.valueTags(planningPath, {
    authoritative: complete,
    conflictOnModify: complete,
    packageJson: (intent) => composed(intent, packageJsonOperations(intent)),
    tsComposition: (intent) =>
      composed(intent, [
        ...intent.compositions.flatMap((composition) => [
          importOperation(composition.import),
          appendCallArgOperation(composition),
        ]),
        ...intent.objectFields.flatMap((objectField) => [
          ...optionalImportOperation(objectField.import),
          objectFieldOperation(objectField),
        ]),
      ]),
    jsxSlot: (intent) =>
      composed(
        intent,
        intent.jsxSlots.flatMap((jsxSlot) => [
          ...optionalImportOperation(jsxSlot.import),
          jsxSlotOperation(jsxSlot),
        ]),
      ),
  });
};

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

const planConflict = {
  tsconfig: (path: RepositoryPath) =>
    PlanConflict.cases.tsconfig.make({ path }),
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
};

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
}): FlatStringRecordAssessment => {
  const { path } = intent;
  const dependenciesBySection = Arr.groupBy(
    intent.dependencies,
    (plannedDependency) => plannedDependency.section,
  );
  const exportAssessment = assessFlatStringRecordEntries(
    packageJson["exports"],
    intent.exports,
    (plannedExport) => planConflict.exports(path, plannedExport.name),
  );
  const dependencyAssessments = DEPENDENCY_SECTIONS.flatMap((section) => {
    const sectionDependencies = dependenciesBySection[section];
    return sectionDependencies === undefined
      ? []
      : [
          assessFlatStringRecordEntries(
            packageJson[section],
            sectionDependencies,
            (plannedDependency) =>
              planConflict.dependencies(path, plannedDependency),
          ),
        ];
  });
  const scriptAssessment = assessFlatStringRecordEntries(
    packageJson["scripts"],
    intent.scripts,
    (script) => planConflict.scripts(path, script.name),
  );

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

const assessFlatStringRecordEntries = <
  Entry extends { name: string; value: string },
>(
  existingValue: unknown,
  requiredEntries: ReadonlyArray<Entry>,
  toConflict: (entry: Entry) => PlanConflict,
): FlatStringRecordAssessment => {
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
    Object.hasOwn(existingEntries, entry.name)
      ? existingEntries[entry.name]
      : undefined;
  const conflicts = requiredEntries.flatMap((entry) => {
    const existingEntry = existingEntryOf(entry);

    return existingEntry === undefined || existingEntry === entry.value
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
            new PlanError({
              message: `Expected ${path} to be a file.`,
            }),
          ),
      });
