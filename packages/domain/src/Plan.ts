import { Order, Schema } from "effect";
import { pathOrd } from "./Order";

// =============================================================================
// RepoSnapshot Path States
// =============================================================================

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

export class PlanFailure extends Schema.TaggedErrorClass<PlanFailure>()(
  "PlanFailure",
  {
    reason: Schema.Literals(["repoRootNotEmpty", "invalidPlanIntent"]),
    message: Schema.String,
  },
) {}

// =============================================================================
// Composition Operations
// =============================================================================

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

/**
 * TypeScript Operations - for AST manipulation via ts-morph
 */
export const TsAddImportOp = Schema.TaggedStruct("ts-add-import", {
  fileType: Schema.tag("typescript"),
  moduleSpecifier: Schema.String,
  namedImports: Schema.optional(Schema.Array(Schema.String)),
  defaultImport: Schema.optional(Schema.String),
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

export const TsJsxSlotOp = Schema.TaggedStruct("ts-jsx-slot", {
  fileType: Schema.tag("typescript"),
  slotId: Schema.String,
  content: Schema.String,
});

export const CompositionOperation = Schema.Union([
  // JSON operations
  JsonPkgExportsOp,
  JsonPkgDepsOp,
  JsonPkgScriptsOp,
  // TypeScript operations
  TsAddImportOp,
  TsAddReexportOp,
  TsAppendCallArgOp,
  TsJsxSlotOp,
]).pipe(Schema.toTaggedUnion("fileType"));

// =============================================================================
// Plan Classification and Outcomes
// =============================================================================

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
});

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
export class Plan extends Schema.Class<Plan>("Plan")({
  outcomes: Schema.Array(PlanOutcome),
  conflicts: Schema.Array(PlanConflict),
}) {
  toSorted(): Plan {
    return new Plan({
      outcomes: [...this.outcomes].sort(pathOrd),
      conflicts: [...this.conflicts].sort(
        Order.mapInput(
          Order.String,
          (conflict: typeof PlanConflict.Type): string =>
            PlanConflict.match(conflict, {
              exports: (c) => `exports:${c.path}:${c.name}`,
              dependencies: (c) =>
                `dependencies:${c.path}:${c.section}:${c.name}`,
              scripts: (c) => `scripts:${c.path}:${c.name}`,
              barrelExport: (c) => `barrelExport:${c.path}:${c.exportPath}`,
              tsconfig: (c) => `tsconfig:${c.path}`,
              completeFile: (c) => `completeFile:${c.path}`,
              compositionTargetNotFound: (c) =>
                `compositionTargetNotFound:${c.path}:${c.targetVariable}:${c.functionName}`,
            }),
        ),
      ),
    });
  }
}
