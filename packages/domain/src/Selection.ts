import { Schema } from "effect";
import { RepoModuleId, TargetModuleId } from "./Scaffold";

export const TargetModuleSelection = Schema.Struct({
  moduleId: TargetModuleId,
});

export const TargetSelection = Schema.Struct({
  targetId: Schema.NonEmptyString,
  targetModules: Schema.Array(TargetModuleSelection),
});

export const Selection = Schema.Struct({
  targets: Schema.Array(TargetSelection),
  repoModules: Schema.Array(RepoModuleId),
});
