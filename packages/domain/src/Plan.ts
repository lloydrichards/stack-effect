import { Order, Schema } from "effect";
import { pathOrd } from "./Order";

export const RepoSnapshot = Schema.Struct({
  paths: Schema.Array(
    Schema.Union([
      Schema.TaggedStruct("missing", {
        path: Schema.String,
      }),
      Schema.TaggedStruct("directory", {
        path: Schema.String,
      }),
      Schema.TaggedStruct("file", {
        path: Schema.String,
        contents: Schema.String,
      }),
    ]),
  ),
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

export const CompositionOperation = Schema.Union([
  // JSON operations
  JsonPkgExportsOp,
  JsonPkgDepsOp,
  JsonPkgScriptsOp,
  // TypeScript operations
  TsAddImportOp,
  TsAddReexportOp,
  TsAppendCallArgOp,
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

export class Plan extends Schema.Class<Plan>("Plan")({
  outcomes: Schema.Array(
    Schema.Union([
      Schema.TaggedStruct("complete", {
        path: Schema.String,
        classification: PlanEntryClassification,
        contents: Schema.String,
      }),
      Schema.TaggedStruct("composed", {
        path: Schema.String,
        classification: PlanEntryClassification,
        seedContents: Schema.optional(Schema.String),
        operations: Schema.Array(CompositionOperation),
      }),
    ]),
  ),
  conflicts: Schema.Array(
    Schema.Union([
      Schema.TaggedStruct("exports", {
        path: Schema.String,
        name: Schema.String,
      }),
      Schema.TaggedStruct("dependencies", {
        path: Schema.String,
        section: Schema.String,
        name: Schema.String,
      }),
      Schema.TaggedStruct("scripts", {
        path: Schema.String,
        name: Schema.String,
      }),
      Schema.TaggedStruct("barrelExport", {
        path: Schema.String,
        exportPath: Schema.String,
      }),
      Schema.TaggedStruct("tsconfig", {
        path: Schema.String,
      }),
      Schema.TaggedStruct("completeFile", {
        path: Schema.String,
      }),
      Schema.TaggedStruct("compositionTargetNotFound", {
        path: Schema.String,
        targetVariable: Schema.String,
        functionName: Schema.String,
      }),
    ]),
  ),
}) {
  toSorted(): Plan {
    return new Plan({
      outcomes: [...this.outcomes].sort(pathOrd),
      conflicts: [...this.conflicts].sort(
        Order.mapInput(
          Order.String,
          (conflict: typeof Plan.fields.conflicts.schema.Type): string => {
            switch (conflict._tag) {
              case "exports":
                return `exports:${conflict.path}:${conflict.name}`;
              case "dependencies":
                return `dependencies:${conflict.path}:${conflict.section}:${conflict.name}`;
              case "scripts":
                return `scripts:${conflict.path}:${conflict.name}`;
              case "barrelExport":
                return `barrelExport:${conflict.path}:${conflict.exportPath}`;
              case "tsconfig":
                return `tsconfig:${conflict.path}`;
              case "completeFile":
                return `completeFile:${conflict.path}`;
              case "compositionTargetNotFound":
                return `compositionTargetNotFound:${conflict.path}:${conflict.targetVariable}:${conflict.functionName}`;
            }
          },
        ),
      ),
    });
  }
}
