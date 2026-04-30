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

export const RequiredStructure = Schema.Struct({
  exports: Schema.optional(
    Schema.Array(
      Schema.Struct({
        name: Schema.String,
        value: Schema.String,
      }),
    ),
  ),
  dependencies: Schema.optional(
    Schema.Array(
      Schema.Struct({
        section: Schema.Literals(["dependencies", "devDependencies"]),
        entries: Schema.Array(
          Schema.Struct({
            name: Schema.String,
            value: Schema.String,
          }),
        ),
      }),
    ),
  ),
  scripts: Schema.optional(
    Schema.Array(
      Schema.Struct({
        name: Schema.String,
        value: Schema.String,
      }),
    ),
  ),
  reExports: Schema.optional(Schema.Array(Schema.String)),
});

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
      Schema.TaggedStruct("partial", {
        path: Schema.String,
        classification: PlanEntryClassification,
        requiredStructure: RequiredStructure,
      }),
      Schema.TaggedStruct("composed", {
        path: Schema.String,
        classification: PlanEntryClassification,
        contents: Schema.String,
        requiredStructure: RequiredStructure,
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
            }
          },
        ),
      ),
    });
  }
}
