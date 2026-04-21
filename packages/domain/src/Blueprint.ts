import { Schema } from "effect";
import {
  PackagePublicEntrypoint,
  RepoModuleId,
  TargetIdentity,
  TargetModuleId,
  TargetModuleReference,
} from "./Scaffold";

export const BlueprintError = Schema.Union([
  Schema.TaggedStruct("InvalidTarget", {
    targetId: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("UnknownTargetKind", {
    targetKind: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("UnknownRepoModule", {
    moduleId: RepoModuleId,
  }),
  Schema.TaggedStruct("UnknownTargetModule", {
    moduleId: TargetModuleId,
  }),
  Schema.TaggedStruct("InvalidTargetModuleTarget", {
    targetModule: TargetModuleReference,
  }),
  Schema.TaggedStruct("UnsupportedTargetModule", {
    targetModule: TargetModuleReference,
  }),
  Schema.TaggedStruct("ConceptualTargetCollision", {
    conceptualPath: Schema.NonEmptyString,
    targetIds: Schema.Tuple([Schema.NonEmptyString, Schema.NonEmptyString]),
  }),
  Schema.TaggedStruct("ContradictoryTargetComposition", {
    targetId: Schema.NonEmptyString,
    slot: Schema.Literal("package-public-entrypoint"),
  }),
]);

export const BlueprintNodeReference = Schema.Union([
  Schema.TaggedStruct("target", {
    targetId: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("repo-module", {
    moduleId: RepoModuleId,
  }),
  Schema.TaggedStruct("target-module", {
    targetId: Schema.NonEmptyString,
    moduleId: TargetModuleId,
  }),
]);

export const BlueprintCause = Schema.Union([
  Schema.TaggedStruct("selection", {
    source: BlueprintNodeReference,
  }),
  Schema.TaggedStruct("dependency", {
    source: BlueprintNodeReference,
  }),
]);

export const BlueprintStatus = Schema.Union([
  Schema.Literal("selected"),
  Schema.Literal("implied"),
]);

export const ResolvedTargetModule = Schema.Struct({
  moduleId: TargetModuleId,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
});

export const ResolvedTarget = Schema.Struct({
  targetId: Schema.NonEmptyString,
  identity: TargetIdentity,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
  targetModules: Schema.Array(ResolvedTargetModule),
});

export const ResolvedRepoModule = Schema.Struct({
  moduleId: RepoModuleId,
  status: BlueprintStatus,
  causes: Schema.NonEmptyArray(BlueprintCause),
});

export const TargetComposition = Schema.Union([
  Schema.TaggedStruct("package", {
    publicEntrypoint: PackagePublicEntrypoint,
  }),
]);

export const BlueprintIntent = Schema.Union([
  Schema.TaggedStruct("PackageEntrypoint", {
    targetId: Schema.NonEmptyString,
    publicEntrypoint: PackagePublicEntrypoint,
  }),
  Schema.TaggedStruct("RepoModule", {
    moduleId: RepoModuleId,
  }),
  Schema.TaggedStruct("Target", {
    targetId: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("TargetModule", {
    targetId: Schema.NonEmptyString,
    moduleId: TargetModuleId,
  }),
]);

export const BlueprintWarning = Schema.Union([
  Schema.TaggedStruct("DuplicateSelectionNormalized", {
    node: BlueprintNodeReference,
  }),
  Schema.TaggedStruct("RedundantSelectionNormalized", {
    node: BlueprintNodeReference,
    causes: Schema.NonEmptyArray(BlueprintNodeReference),
  }),
  Schema.TaggedStruct("ImpliedDependencyAdded", {
    node: BlueprintNodeReference,
    causes: Schema.NonEmptyArray(BlueprintNodeReference),
  }),
]);

export const Blueprint = Schema.Struct({
  targets: Schema.Array(ResolvedTarget),
  repoModules: Schema.Array(ResolvedRepoModule),
  targetCompositions: Schema.Record(Schema.NonEmptyString, TargetComposition),
  intents: Schema.Array(BlueprintIntent),
  warnings: Schema.Array(BlueprintWarning),
});
