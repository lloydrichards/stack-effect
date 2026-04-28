import { Schema } from "effect";
import { pathOrd, planConflictOrd } from "./Order";

export const PlanEntryClassification = Schema.Literals([
  "create",
  "modify",
  "unchanged",
  "needsMergeStrategy",
]);
export type PlanEntryClassification = Schema.Schema.Type<
  typeof PlanEntryClassification
>;

export const RepoSnapshotPath = Schema.Union([
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
]);
export type RepoSnapshotPath = Schema.Schema.Type<typeof RepoSnapshotPath>;

export const RepoSnapshot = Schema.Struct({
  paths: Schema.Array(RepoSnapshotPath),
});
export type RepoSnapshot = Schema.Schema.Type<typeof RepoSnapshot>;

export class PlanFailure extends Schema.TaggedErrorClass<PlanFailure>()(
  "PlanFailure",
  {
    reason: Schema.Literals(["repoRootNotEmpty", "invalidPlanIntent"]),
    message: Schema.String,
  },
) {}

export const PlanConflict = Schema.Union([
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
]);
export type PlanConflict = Schema.Schema.Type<typeof PlanConflict>;

export const PlannedPackageJsonExport = Schema.Struct({
  exportKey: Schema.String,
  exportValue: Schema.String,
});
export type PlannedPackageJsonExport = Schema.Schema.Type<
  typeof PlannedPackageJsonExport
>;

export const PlannedPackageJsonDependency = Schema.Struct({
  dependencyName: Schema.String,
  dependencyValue: Schema.String,
});
export type PlannedPackageJsonDependency = Schema.Schema.Type<
  typeof PlannedPackageJsonDependency
>;

export const PlannedPackageJsonScript = Schema.Struct({
  scriptName: Schema.String,
  scriptValue: Schema.String,
});
export type PlannedPackageJsonScript = Schema.Schema.Type<
  typeof PlannedPackageJsonScript
>;

export const PlannedDependencySection = Schema.Struct({
  section: Schema.Literals(["dependencies", "devDependencies"]),
  entries: Schema.Array(PlannedPackageJsonDependency),
});
export type PlannedDependencySection = Schema.Schema.Type<
  typeof PlannedDependencySection
>;

export const RequiredStructure = Schema.Struct({
  packageJsonExports: Schema.optional(Schema.Array(PlannedPackageJsonExport)),
  packageJsonDependencies: Schema.optional(
    Schema.Array(PlannedDependencySection),
  ),
  packageJsonScripts: Schema.optional(Schema.Array(PlannedPackageJsonScript)),
  reExports: Schema.optional(Schema.Array(Schema.String)),
});
export type RequiredStructure = Schema.Schema.Type<typeof RequiredStructure>;

export const AuthoritativeFileOutcome = Schema.TaggedStruct("authoritative", {
  path: Schema.String,
  classification: PlanEntryClassification,
  contents: Schema.String,
});
export type AuthoritativeFileOutcome = Schema.Schema.Type<
  typeof AuthoritativeFileOutcome
>;

export const StructuralMergeOutcome = Schema.TaggedStruct("structural", {
  path: Schema.String,
  classification: PlanEntryClassification,
  requiredStructure: RequiredStructure,
});
export type StructuralMergeOutcome = Schema.Schema.Type<
  typeof StructuralMergeOutcome
>;

export const PlannedFileOutcome = Schema.Union([
  AuthoritativeFileOutcome,
  StructuralMergeOutcome,
]);
export type PlannedFileOutcome = Schema.Schema.Type<typeof PlannedFileOutcome>;

export class Plan extends Schema.Class<Plan>("Plan")({
  outcomes: Schema.Array(PlannedFileOutcome),
  conflicts: Schema.Array(PlanConflict),
}) {
  toSorted(): Plan {
    return new Plan({
      outcomes: [...this.outcomes].sort(pathOrd),
      conflicts: [...this.conflicts].sort(planConflictOrd),
    });
  }
}
