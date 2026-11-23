import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { Apply, ApplyFailure, type StalePlanFailure } from "@repo/domain/Apply";
import type { BlueprintFailure } from "@repo/domain/Blueprint";
import type { CatalogNotFound } from "@repo/domain/Catalog";
import type { PlanFailure } from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import { Context, Effect, Layer, Path, Schema } from "effect";
import { RecipePreview, RecipePreviewInput } from "../../RecipePreviewSchema";
import { ApplyWorkspaces } from "../apply/ApplyWorkspaces";
import { BlueprintService } from "../blueprint/BlueprintService";
import type { RecipeError } from "./RecipeErrors";
import { RecipeService } from "./RecipeService";

const StackConfigFromJsonString = Schema.fromJsonString(StackConfig, {
  space: 2,
});

export { RecipePreview, RecipePreviewInput };

export type RecipePreviewError =
  | RecipeError
  | BlueprintFailure
  | PlanFailure
  | CatalogNotFound
  | ApplyFailure
  | StalePlanFailure;

export class RecipePreviewer extends Context.Service<
  RecipePreviewer,
  {
    readonly preview: (
      input: RecipePreviewInput,
    ) => Effect.Effect<RecipePreview, RecipePreviewError>;
  }
>()("@repo/scaffold/RecipePreviewer") {
  static readonly layer = Layer.effect(
    RecipePreviewer,
    Effect.gen(function* () {
      const recipes = yield* RecipeService;
      const blueprints = yield* BlueprintService;
      const workspaces = yield* ApplyWorkspaces;

      const preview = Effect.fn("RecipePreviewer.preview")(function* ({
        recipe,
        config,
      }: RecipePreviewInput) {
        const selection = yield* recipes.resolve(recipe, {
          config,
          providerStrategy: { _tag: "fail-on-ambiguous" },
        });
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

        return {
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
        } satisfies RecipePreview;
      });

      return RecipePreviewer.of({ preview });
    }),
  ).pipe(
    Layer.provide(RecipeService.layer),
    Layer.provide(BlueprintService.layer),
    Layer.provide(
      ApplyWorkspaces.layer.pipe(
        Layer.provide(
          Layer.merge(
            Layer.provideMerge(MemoryFileSystem.layer, BrowserCrypto.layer),
            Path.layer,
          ),
        ),
      ),
    ),
  );
}
