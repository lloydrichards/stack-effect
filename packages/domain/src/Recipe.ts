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
 * How recipe resolution picks a provider module for a required capability that
 * the recipe leaves unmet.
 *
 * **When to use**
 *
 * Pass it inside `RecipeResolveOptions`. Use `fail-on-ambiguous` when a user
 * must choose between alternatives, `first-provider` when any provider will
 * do, and `explicit` to record choices a user already made.
 *
 * **Gotchas**
 *
 * Every strategy adds the only candidate when there is one. `explicit` falls
 * back to `fail-on-ambiguous` for requirements it does not name, and rejects a
 * named module that is not one of the candidates.
 */
const RecipeProviderStrategy = Schema.TaggedUnion({
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

/**
 * A selected module requires a capability on a target, and no module in the
 * selected catalogs provides it there for the configured runtime.
 *
 * **When to use**
 *
 * Handle it where a recipe is resolved; `requestingModuleId`, `target`, and
 * `capability` identify the unmet requirement.
 */
export class MissingRecipeProvider extends Schema.TaggedError<MissingRecipeProvider>()(
  "MissingRecipeProvider",
  {
    requestingModuleId: ModuleId,
    target: TargetIdentity,
    capability: ModuleCapability,
  },
) {
  override get message(): string {
    return `Module "${this.requestingModuleId}" requires capability "${this.capability}" on ${this.target.toKey()}, but no module in the selected catalogs provides it there for this runtime. Select a provider module explicitly or add a catalog that provides one.`;
  }
}

/**
 * A module that can provide a required capability.
 */
const RecipeProviderCandidate = Schema.Struct({
  moduleId: ModuleId,
  title: Schema.String,
  description: Schema.String,
});

/**
 * A selected module requires a capability on a target, several modules can
 * provide it, and the provider strategy does not choose between them.
 *
 * **When to use**
 *
 * Handle it where a recipe is resolved; `providers` lists the candidates in
 * catalog order so a caller can ask the user to pick one.
 */
export class AmbiguousRecipeProvider extends Schema.TaggedError<AmbiguousRecipeProvider>()(
  "AmbiguousRecipeProvider",
  {
    requestingModuleId: ModuleId,
    target: TargetIdentity,
    capability: ModuleCapability,
    providers: Schema.Array(RecipeProviderCandidate),
  },
) {
  override get message(): string {
    return `Module "${this.requestingModuleId}" requires capability "${this.capability}" on ${this.target.toKey()}, and several modules provide it: ${this.providers.map((provider) => `${provider.moduleId} (${provider.title})`).join(", ")}. Select one of them on ${this.target.toKey()} explicitly.`;
  }
}

/**
 * An `explicit` provider strategy names a module for a requirement, and that
 * module is not one of the providers the requester can use there.
 *
 * **When to use**
 *
 * Handle it where a recipe is resolved; `moduleId` is the rejected choice and
 * `providers` lists the valid candidates in catalog order.
 */
export class InvalidRecipeProvider extends Schema.TaggedError<InvalidRecipeProvider>()(
  "InvalidRecipeProvider",
  {
    requestingModuleId: ModuleId,
    target: TargetIdentity,
    capability: ModuleCapability,
    moduleId: ModuleId,
    providers: Schema.Array(RecipeProviderCandidate),
  },
) {
  override get message(): string {
    return `Module "${this.requestingModuleId}" requires capability "${this.capability}" on ${this.target.toKey()}, and "${this.moduleId}" cannot provide it there for this runtime. Choose one of: ${this.providers.map((provider) => `${provider.moduleId} (${provider.title})`).join(", ")}.`;
  }
}

/** Failures `RecipeService.resolve` can return. */
export type RecipeResolveError =
  | InvalidRecipeSpec
  | MissingRecipeProvider
  | AmbiguousRecipeProvider
  | InvalidRecipeProvider;
