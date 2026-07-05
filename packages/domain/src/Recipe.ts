import { Schema } from "effect";
import { ModuleId, TargetIdentity } from "./Catalog";

/**
 * A portable recipe target describes a desired target and the modules the user
 * selected for that target. Resolution, validation, defaults, and provider
 * choices are owned by the CLI/catalog layer.
 */
export const RecipeTargetSpec = Schema.Struct({
  target: TargetIdentity,
  modules: Schema.Array(ModuleId),
});

export type RecipeTargetSpec = typeof RecipeTargetSpec.Type;

/**
 * A Recipe is dashboard/CLI intent: selected workspace, app, and package
 * targets with their requested modules.
 */
export const RecipeSpec = Schema.Struct({
  targets: Schema.Array(RecipeTargetSpec),
});

export type RecipeSpec = typeof RecipeSpec.Type;
