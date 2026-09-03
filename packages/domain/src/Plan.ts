import { Array as Arr, Order, Schema } from "effect";
import { pathOrd } from "./Order";
import { StackConfig } from "./Scaffold";
import { Selection } from "./Selection";

/**
 * The portable request accepted by planning entry points.
 *
 * A persisted project configuration may supply `config`, so callers can omit
 * it when their entry point has a configuration lookup step.
 */
export const PlanRequest = Schema.Struct({
  selection: Selection,
  config: Schema.optional(StackConfig),
});

export type PlanRequest = typeof PlanRequest.Type;

export const RepoSnapshotPath = Schema.TaggedUnion({
  missing: {
    path: Schema.String,
  },
  directory: {
    path: Schema.String,
  },
  file: {
    path: Schema.String,
    contents: Schema.String,
  },
});

export const RepoSnapshot = Schema.Struct({
  paths: Schema.Array(RepoSnapshotPath),
});

export class PlanFailure extends Schema.TaggedError<PlanFailure>()(
  "PlanFailure",
  {
    reason: Schema.Literals(["repoRootNotEmpty", "invalidPlanIntent"]),
    message: Schema.String,
  },
) {}

export const JsonPkgExportsOp = Schema.TaggedStruct("json-pkg-exports", {
  fileType: Schema.tag("json"),
  entries: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      value: Schema.String,
    }),
  ),
});

export const JsonPkgDepsOp = Schema.TaggedStruct("json-pkg-deps", {
  fileType: Schema.tag("json"),
  section: Schema.Literals(["dependencies", "devDependencies"]),
  entries: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      value: Schema.String,
    }),
  ),
});

export const JsonPkgScriptsOp = Schema.TaggedStruct("json-pkg-scripts", {
  fileType: Schema.tag("json"),
  entries: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      value: Schema.String,
    }),
  ),
});

export const JsonPkgScriptsAppendOp = Schema.TaggedStruct(
  "json-pkg-scripts-append",
  {
    fileType: Schema.tag("json"),
    entries: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        fragment: Schema.String,
      }),
    ),
  },
);

/**
 * TypeScript Operations - for AST manipulation via ts-morph
 */
export const TsAddImportOp = Schema.TaggedStruct("ts-add-import", {
  fileType: Schema.tag("typescript"),
  moduleSpecifier: Schema.String,
  namedImports: Schema.optional(Schema.Array(Schema.String)),
  defaultImport: Schema.optional(Schema.String),
  namespaceImport: Schema.optional(Schema.String),
  typeOnly: Schema.optional(Schema.Boolean),
});

export const TsAddReexportOp = Schema.TaggedStruct("ts-add-reexport", {
  fileType: Schema.tag("typescript"),
  moduleSpecifier: Schema.String,
  namedExports: Schema.optional(Schema.Array(Schema.String)),
  typeOnly: Schema.optional(Schema.Boolean),
});

export const TsAppendCallArgOp = Schema.TaggedStruct("ts-append-call-arg", {
  fileType: Schema.tag("typescript"),
  targetVariable: Schema.String,
  functionName: Schema.String,
  argument: Schema.String,
});

export const TsObjectFieldOp = Schema.TaggedStruct("ts-object-field", {
  fileType: Schema.tag("typescript"),
  targetVariable: Schema.String,
  functionName: Schema.String,
  field: Schema.String,
  value: Schema.String,
});

export const TsJsxSlotOp = Schema.TaggedStruct("ts-jsx-slot", {
  fileType: Schema.tag("typescript"),
  slotId: Schema.String,
  content: Schema.String,
});

const JsonCompositionOperationSchema = Schema.Union([
  JsonPkgExportsOp,
  JsonPkgDepsOp,
  JsonPkgScriptsOp,
  JsonPkgScriptsAppendOp,
]);

const TypeScriptCompositionOperationSchema = Schema.Union([
  TsAddImportOp,
  TsAddReexportOp,
  TsAppendCallArgOp,
  TsObjectFieldOp,
  TsJsxSlotOp,
]);

export type JsonCompositionOperation = Schema.Schema.Type<
  typeof JsonCompositionOperationSchema
>;

export type TypeScriptCompositionOperation = Schema.Schema.Type<
  typeof TypeScriptCompositionOperationSchema
>;

export const CompositionOperation = Schema.Union([
  JsonCompositionOperationSchema,
  TypeScriptCompositionOperationSchema,
]);

export const PlanEntryClassification = Schema.Literals([
  "create",
  "modify",
  "unchanged",
  "conflict",
]);

export const PlanOutcome = Schema.TaggedUnion({
  complete: {
    path: Schema.String,
    classification: PlanEntryClassification,
    contents: Schema.String,
  },
  composed: {
    path: Schema.String,
    classification: PlanEntryClassification,
    seedContents: Schema.optional(Schema.String),
    operations: Schema.Array(CompositionOperation),
  },
});

export const PlanConflict = Schema.TaggedUnion({
  exports: {
    path: Schema.String,
    name: Schema.String,
  },
  dependencies: {
    path: Schema.String,
    section: Schema.String,
    name: Schema.String,
  },
  scripts: {
    path: Schema.String,
    name: Schema.String,
  },
  barrelExport: {
    path: Schema.String,
    exportPath: Schema.String,
  },
  tsconfig: {
    path: Schema.String,
  },
  completeFile: {
    path: Schema.String,
  },
  compositionTargetNotFound: {
    path: Schema.String,
    targetVariable: Schema.String,
    functionName: Schema.String,
  },
  jsxSlotTargetNotFound: {
    path: Schema.String,
    slotId: Schema.String,
  },
});

const planConflictKey = (conflict: typeof PlanConflict.Type): string =>
  PlanConflict.match(conflict, {
    exports: (c) => JSON.stringify([c._tag, c.path, c.name]),
    dependencies: (c) => JSON.stringify([c._tag, c.path, c.section, c.name]),
    scripts: (c) => JSON.stringify([c._tag, c.path, c.name]),
    barrelExport: (c) => JSON.stringify([c._tag, c.path, c.exportPath]),
    tsconfig: (c) => JSON.stringify([c._tag, c.path]),
    completeFile: (c) => JSON.stringify([c._tag, c.path]),
    compositionTargetNotFound: (c) =>
      JSON.stringify([c._tag, c.path, c.targetVariable, c.functionName]),
    jsxSlotTargetNotFound: (c) => JSON.stringify([c._tag, c.path, c.slotId]),
  });

const duplicates = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  Arr.map(
    Arr.filter(
      Object.entries(Arr.groupBy(values, (value) => value)),
      ([, groupedValues]) => groupedValues.length > 1,
    ),
    ([value]) => value,
  );

const PlanFields = Schema.Struct({
  outcomes: Schema.Array(PlanOutcome),
  conflicts: Schema.Array(PlanConflict),
}).check(
  Schema.makeFilter(({ conflicts, outcomes }) => {
    const outcomePaths = outcomes.map((outcome) => outcome.path);
    const conflictKeys = conflicts.map(planConflictKey);
    const conflictedOutcomePaths = new Set(
      outcomes
        .filter((outcome) => outcome.classification === "conflict")
        .map((outcome) => outcome.path),
    );
    const conflictPaths = new Set(conflicts.map((conflict) => conflict.path));

    return [
      ...duplicates(outcomePaths).map(
        (path) => `Plan outcome paths must be unique; duplicate path: ${path}`,
      ),
      ...duplicates(conflictKeys).map(
        (key) =>
          `Plan conflict diagnostics must be unique; duplicate identity: ${key}`,
      ),
      ...[...conflictPaths]
        .filter((path) => !conflictedOutcomePaths.has(path))
        .map(
          (path) =>
            `Plan conflict diagnostic path must reference a conflicted outcome: ${path}`,
        ),
      ...[...conflictedOutcomePaths]
        .filter((path) => !conflictPaths.has(path))
        .map(
          (path) =>
            `Plan conflicted outcome must have at least one conflict diagnostic: ${path}`,
        ),
    ];
  }),
);

/**
 * The repo-aware outcome of applying a Blueprint to the current filesystem.
 *
 * A Plan pairs each contributed file path with a classification (create,
 * modify, unchanged, or conflict) and its resolved contents or composition
 * operations. It also surfaces detected conflicts that require user decisions
 * before execution.
 *
 * The Plan is policy-free: it records what *would* happen but does not make
 * apply decisions. Those belong to the Apply stage via ApplyDecision entries.
 *
 * @category Plan
 * @since 1.0.0
 */
export class Plan extends Schema.Class<Plan>("Plan")(PlanFields) {
  toSorted(): Plan {
    return new Plan({
      outcomes: [...this.outcomes].sort(pathOrd),
      conflicts: [...this.conflicts].sort(
        Order.mapInput(Order.String, planConflictKey),
      ),
    });
  }
}
