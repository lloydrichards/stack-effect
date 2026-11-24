/**
 * Recipes: resolve user intent into a Selection against the loaded catalog. The
 * service-free pieces, target spec syntax and stack configuration defaults, live
 * in `@repo/domain/Recipe` and `@repo/domain/StackConfig`.
 */
import type { CatalogService } from "@repo/catalog";
import type {
  RecipeResolveError,
  RecipeResolveOptions,
  RecipeSpec,
} from "@repo/domain/Recipe";
import type { Selection } from "@repo/domain/Selection";
import type { StackConfig } from "@repo/domain/StackConfig";
import { Context, type Effect, Layer } from "effect";
import * as internal from "./internal/recipeResolver";

/**
 * Resolves recipes into Selections and renders `create` commands.
 *
 * **When to use**
 *
 * Resolve a recipe from the CLI or Recipe Builder before resolving a
 * Blueprint. Provide `StackConfigDefaults` to change the defaults a recipe
 * falls back to.
 *
 * **Gotchas**
 *
 * `resolve` adds the workspace modules the configuration implies, such as the
 * TypeScript, monorepo, lint, format, and test tools. It also adds a provider
 * module for each required capability the recipe leaves unmet, following
 * `providerStrategy`: `fail-on-ambiguous` adds the only candidate and fails
 * with `AmbiguousRecipeProvider` when there are several, `first-provider`
 * adds the first candidate in catalog order, and `explicit` adds the module it
 * names or fails with `InvalidRecipeProvider` when that module is not a
 * candidate. All fail with `MissingRecipeProvider` when there is none.
 * Candidates come from sources the requesting module's source may reference,
 * and a module Blueprint attaches anyway counts as the provider.
 * `renderCreateCommand`
 * omits flags whose values match the runtime's defaults.
 */
export class RecipeResolver extends Context.Service<
  RecipeResolver,
  {
    readonly resolve: (
      spec: RecipeSpec,
      options: RecipeResolveOptions,
    ) => Effect.Effect<Selection, RecipeResolveError>;
    readonly renderCreateCommand: (options: {
      readonly config: StackConfig;
      readonly selection: Selection;
    }) => string;
  }
>()("@repo/scaffold/RecipeResolver") {
  static readonly layer: Layer.Layer<RecipeResolver, never, CatalogService> =
    Layer.effect(RecipeResolver, internal.make);
}
