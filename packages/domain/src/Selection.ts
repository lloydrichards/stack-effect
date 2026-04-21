import { Schema } from "effect";
import { RepoModuleId, TargetModuleId } from "./Scaffold";

export const TargetModuleSelection = Schema.Struct({
  id: TargetModuleId,
});

export const TargetSelection = Schema.Struct({
  id: Schema.NonEmptyString,
  modules: Schema.Array(TargetModuleSelection),
});

export const Selection = Schema.Struct({
  targets: Schema.Array(TargetSelection),
  repoModules: Schema.Array(RepoModuleId),
});
