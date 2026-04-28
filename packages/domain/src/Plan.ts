import { Schema } from "effect";
import { pathOrd, planConflictOrd } from "./Order";

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

export const PlannedPackageJsonExport = Schema.Struct({
  exportKey: Schema.String,
  exportValue: Schema.String,
});

export const PlannedPackageJsonDependency = Schema.Struct({
  dependencyName: Schema.String,
  dependencyValue: Schema.String,
});

export const PlannedPackageJsonScript = Schema.Struct({
  scriptName: Schema.String,
  scriptValue: Schema.String,
});

export const PlannedDependencySection = Schema.Struct({
  section: Schema.Literals(["dependencies", "devDependencies"]),
  entries: Schema.Array(PlannedPackageJsonDependency),
});

export const RequiredStructure = Schema.Struct({
  packageJsonExports: Schema.optional(Schema.Array(PlannedPackageJsonExport)),
  packageJsonDependencies: Schema.optional(
    Schema.Array(PlannedDependencySection),
  ),
  packageJsonScripts: Schema.optional(Schema.Array(PlannedPackageJsonScript)),
  reExports: Schema.optional(Schema.Array(Schema.String)),
});

export const PlanEntryClassification = Schema.Literals([
  "create",
  "modify",
  "unchanged",
  "needsMergeStrategy",
]);

export class Plan extends Schema.Class<Plan>("Plan")({
  outcomes: Schema.Array(
    Schema.Union([
      Schema.TaggedStruct("authoritative", {
        path: Schema.String,
        classification: PlanEntryClassification,
        contents: Schema.String,
      }),
      Schema.TaggedStruct("structural", {
        path: Schema.String,
        classification: PlanEntryClassification,
        requiredStructure: RequiredStructure,
      }),
    ]),
  ),
  conflicts: Schema.Array(
    Schema.Union([
      Schema.TaggedStruct("packageJsonExports", {
        path: Schema.String,
        exportKey: Schema.String,
      }),
      Schema.TaggedStruct("packageJsonDependencies", {
        path: Schema.String,
        section: Schema.String,
        dependencyName: Schema.String,
      }),
      Schema.TaggedStruct("packageJsonScripts", {
        path: Schema.String,
        scriptName: Schema.String,
      }),
      Schema.TaggedStruct("barrelExport", {
        path: Schema.String,
        exportPath: Schema.String,
      }),
      Schema.TaggedStruct("tsconfig", {
        path: Schema.String,
      }),
      Schema.TaggedStruct("authoritativeFile", {
        path: Schema.String,
      }),
    ]),
  ),
}) {
  toSorted(): Plan {
    return new Plan({
      outcomes: [...this.outcomes].sort(pathOrd),
      conflicts: [...this.conflicts].sort(planConflictOrd),
    });
  }
}
