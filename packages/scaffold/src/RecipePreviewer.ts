/**
 * Recipe previews: run a recipe through resolution, Plan, and Apply in an
 * empty staged workspace and return the files it would generate.
 */
import type { CatalogService } from "@repo/catalog";
import { Apply, ApplyFailure, type StalePlanFailure } from "@repo/domain/Apply";
import type { BlueprintFailure } from "@repo/domain/Blueprint";
import type { CatalogNotFound } from "@repo/domain/Catalog";
import type { PlanFailure } from "@repo/domain/Plan";
import {
  RecipeResolveOptions,
  type RecipeResolveError,
} from "@repo/domain/Recipe";
import {
  RecipePreview,
  type RecipePreviewInput,
} from "@repo/domain/RecipePreview";
import { StackConfig } from "@repo/domain/Scaffold";
import {
  Context,
  Effect,
  type FileSystem,
  Layer,
  type Path,
  Schema,
} from "effect";
import type * as Digest from "effect/crypto/Digest";
import type * as SecureRandom from "effect/crypto/SecureRandom";
import { ApplyWorkspaces } from "./ApplyWorkspaces";
import { BlueprintService } from "./BlueprintService";
import { RecipeService } from "./RecipeService";

const StackConfigFromJsonString = Schema.fromJsonString(StackConfig, {
  space: 2,
});

type RecipePreviewError =
  | RecipeResolveError
  | BlueprintFailure
  | PlanFailure
  | CatalogNotFound
  | ApplyFailure
  | StalePlanFailure;

/**
 * Previews the files a recipe would generate in a new repository.
 *
 * **When to use**
 *
 * Show what `create` would write without touching a filesystem, as Recipe
 * Builder does.
 *
 * **Gotchas**
 *
 * The layer leaves the platform to its caller: provide the host
 * `FileSystem` (an in-memory one in the browser), `Path`, `Digest`, and
 * `SecureRandom`. Ambiguous capability providers fail rather than being
 * chosen silently.
 */
export class RecipePreviewer extends Context.Service<
  RecipePreviewer,
  {
    readonly preview: (
      input: RecipePreviewInput,
    ) => Effect.Effect<RecipePreview, RecipePreviewError>;
  }
>()("@repo/scaffold/RecipePreviewer") {
  static readonly layer: Layer.Layer<
    RecipePreviewer,
    never,
    | CatalogService
    | FileSystem.FileSystem
    | Path.Path
    | Digest.Digest
    | SecureRandom.SecureRandom
  > = Layer.effect(
    RecipePreviewer,
    Effect.gen(function* () {
      const recipes = yield* RecipeService;
      const blueprints = yield* BlueprintService;
      const workspaces = yield* ApplyWorkspaces;

      const preview = Effect.fn("RecipePreviewer.preview")(function* ({
        recipe,
        config,
      }: RecipePreviewInput) {
        const selection = yield* recipes.resolve(
          recipe,
          RecipeResolveOptions.make({
            config,
            providerStrategy: { _tag: "fail-on-ambiguous" },
          }),
        );
        const blueprint = yield* blueprints.resolve(selection, config);

        const workspace = yield* workspaces.empty;
        const plan = yield* workspace.plan({ blueprint, config });
        const apply = new Apply({ plan, decisions: [] });
        const applied = yield* workspace.materialize(apply);

        const encodedConfig = yield* Schema.encodeEffect(
          StackConfigFromJsonString,
        )(config).pipe(
          Effect.mapError(
            (error) =>
              new ApplyFailure({
                message: `Could not serialize the preview configuration: ${error.message}`,
                cause: error,
              }),
          ),
        );
        const configContents = `${encodedConfig}\n`;

        return RecipePreview.make({
          command: recipes.renderCreateCommand({ config, selection }),
          selection,
          blueprint,
          files: [
            ...applied.files,
            {
              path: "stack.effect.json",
              status: "created" as const,
              contents: configContents,
            },
          ].sort((left, right) => left.path.localeCompare(right.path)),
        });
      });

      return RecipePreviewer.of({ preview });
    }),
  ).pipe(
    Layer.provide(RecipeService.layer),
    Layer.provide(BlueprintService.layer),
    Layer.provide(ApplyWorkspaces.layer),
  );
}
