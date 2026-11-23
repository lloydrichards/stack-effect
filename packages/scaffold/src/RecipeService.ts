/**
 * Recipe resolution: turns a portable recipe and configuration into a
 * Selection, and renders the CLI command that reproduces it.
 */
import type { CatalogService } from "@repo/catalog";
import type {
  InvalidRecipeSpec,
  RecipeResolveOptions,
  RecipeSpec,
} from "@repo/domain/Recipe";
import type { StackConfig } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import { Context, type Effect, Layer } from "effect";
import * as internal from "./internal/recipeService";

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
 * TypeScript, monorepo, lint, format, and test tools. `renderCreateCommand`
 * omits flags whose values match the runtime's defaults.
 */
export class RecipeService extends Context.Service<
  RecipeService,
  {
    readonly resolve: (
      spec: RecipeSpec,
      options: RecipeResolveOptions,
    ) => Effect.Effect<Selection, InvalidRecipeSpec>;
    readonly renderCreateCommand: (options: {
      readonly config: StackConfig;
      readonly selection: Selection;
    }) => string;
  }
>()("@repo/scaffold/RecipeService") {
  static readonly layer: Layer.Layer<RecipeService, never, CatalogService> =
    Layer.effect(RecipeService, internal.make);
}
