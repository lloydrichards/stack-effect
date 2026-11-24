/**
 * Recipes: resolve user intent into a Selection, with the stack configuration
 * defaults, tool-to-module mapping, and target specs that feed it.
 */
import type { CatalogService } from "@repo/catalog";
import type {
  RecipeResolveError,
  RecipeResolveOptions,
  RecipeSpec,
  RecipeTargetSpec,
} from "@repo/domain/Recipe";
import type { Selection } from "@repo/domain/Selection";
import type { RuntimeName, StackConfig } from "@repo/domain/StackConfig";
import { Context, type Effect, Layer } from "effect";
import * as internal from "./internal/recipeResolver";
import * as recipeTargets from "./internal/recipeTargets";
import * as stackConfigDefaults from "./internal/stackConfigDefaults";

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

/**
 * Decodes one `kind/name[:module-id,...]` string into a recipe target spec,
 * and encodes it back.
 *
 * **When to use**
 *
 * Decode `--target` flags and Recipe Builder URL parameters.
 *
 * **Gotchas**
 *
 * The name must be a valid target name and cannot contain `:`. A trailing
 * `:` with no module IDs is rejected.
 *
 * **Example**
 *
 * ```ts
 * Schema.decodeUnknownSync(RecipeTargetString)("server/api:server-http-api")
 * // { target: { kind: "server", name: "api" }, modules: ["server-http-api"] }
 * ```
 */
export const RecipeTargetString: typeof recipeTargets.RecipeTargetString =
  recipeTargets.RecipeTargetString;

export type RecipeTargetString = recipeTargets.RecipeTargetString;

/**
 * Encodes recipe target specs as `kind/name[:module-id,...]` strings.
 *
 * **When to use**
 *
 * Write targets into a shareable URL or command line.
 */
export const encodeRecipeTargetSpecs: (
  specs: ReadonlyArray<RecipeTargetSpec>,
) => Array<string> = recipeTargets.encodeRecipeTargetSpecs;

/**
 * One target and the modules requested for it, after parsing.
 *
 * **When to use**
 *
 * Read the targets `parseRecipeTargetSpecs` returns, with repeats merged.
 */
export type ParsedRecipeTarget = recipeTargets.ParsedRecipeTarget;

/**
 * Validates decoded target specs and merges repeated targets.
 *
 * **When to use**
 *
 * Turn decoded `--target` flags into the targets of a recipe.
 *
 * **Gotchas**
 *
 * Fails with a message when one spec repeats a module ID. Repeating a target
 * across specs is allowed and merges them.
 */
export const parseRecipeTargetSpecs: (
  specs: ReadonlyArray<RecipeTargetSpec>,
) => Effect.Effect<Array<ParsedRecipeTarget>, string> =
  recipeTargets.parseRecipeTargetSpecs;

/**
 * The configuration a recipe uses for every field the user leaves unset.
 *
 * **When to use**
 *
 * Read it to prefill configuration prompts and forms. Provide a different
 * value to change the defaults, such as for a custom-only catalog selection.
 */
export const StackConfigDefaults: Context.Reference<StackConfig> =
  stackConfigDefaults.StackConfigDefaults;

/**
 * Adjusts tool defaults for a runtime. Deno, for example, defaults to
 * TypeScript 6 with no monorepo, lint, or format tool.
 *
 * **When to use**
 *
 * Recompute the suggested tools when the user changes the runtime.
 *
 * **Gotchas**
 *
 * A runtime override of `undefined` clears that default rather than keeping
 * it. TypeScript falls back to `"6"` when no default names a version.
 */
export const defaultsForRuntime: (
  defaults: stackConfigDefaults.RuntimeDefaults,
  runtime: RuntimeName,
) => stackConfigDefaults.RuntimeDefaults & { readonly typescript: "6" | "7" } =
  stackConfigDefaults.defaultsForRuntime;

/**
 * Maps a configured tool to its workspace module ID.
 *
 * **When to use**
 *
 * Turn a `lint`, `format`, or tool setting into the module a recipe adds.
 *
 * **Gotchas**
 *
 * `biome` maps to different modules for lint and format. An unknown value is
 * returned unchanged, so custom catalogs can name their own module IDs.
 */
export const toWorkspaceModuleId: (
  category: "lint" | "format" | "tool",
  toolValue: string,
) => string = stackConfigDefaults.toWorkspaceModuleId;

/**
 * Maps a workspace module ID back to its configuration tool name.
 *
 * **When to use**
 *
 * Show catalog modules as configuration choices. Unknown IDs are returned
 * unchanged.
 */
export const toWorkspaceToolValue: (moduleId: string) => string =
  stackConfigDefaults.toWorkspaceToolValue;

/**
 * The workspace module ID for a TypeScript version.
 *
 * **When to use**
 *
 * Add the TypeScript module that matches the configured version.
 */
export const toTypeScriptModuleId: (version: "6" | "7") => string =
  stackConfigDefaults.toTypeScriptModuleId;
