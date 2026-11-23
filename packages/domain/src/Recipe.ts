import { Schema } from "effect";
import { ModuleCapability, ModuleId, TargetIdentity } from "./Catalog";
import { StackConfig } from "./Scaffold";

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

/**
 * How recipe resolution picks a provider module when several satisfy a
 * capability.
 *
 * **When to use**
 *
 * Pass it inside `RecipeResolveOptions`. Use `explicit` to record choices a
 * user already made.
 */
export const RecipeProviderStrategy = Schema.TaggedUnion({
  "fail-on-ambiguous": {},
  "first-provider": {},
  explicit: {
    providers: Schema.Array(
      Schema.Struct({
        target: TargetIdentity,
        capability: ModuleCapability,
        moduleId: ModuleId,
      }),
    ),
  },
});

export type RecipeProviderStrategy = typeof RecipeProviderStrategy.Type;

/**
 * The configuration and provider strategy a recipe resolves against.
 *
 * **When to use**
 *
 * Pass it to `RecipeService.resolve` with the recipe.
 */
export const RecipeResolveOptions = Schema.Struct({
  config: StackConfig,
  providerStrategy: RecipeProviderStrategy,
});

export type RecipeResolveOptions = typeof RecipeResolveOptions.Type;

/**
 * The recipe or configuration cannot be resolved against the selected
 * catalogs, such as an unknown target kind or a missing workspace module.
 *
 * **When to use**
 *
 * Handle it where a recipe from user input is resolved; `issues` lists each
 * problem with its path in the recipe.
 */
export class InvalidRecipeSpec extends Schema.TaggedError<InvalidRecipeSpec>()(
  "InvalidRecipeSpec",
  {
    issues: Schema.Array(
      Schema.Struct({
        path: Schema.Array(Schema.Union([Schema.String, Schema.Finite])),
        message: Schema.String,
      }),
    ),
  },
) {
  override get message(): string {
    return `Invalid recipe: ${this.issues.map((issue) => issue.message).join("; ")}`;
  }
}
