import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { CatalogService } from "@repo/catalog";
import { Apply, ApplyFailure, type StalePlanFailure } from "@repo/domain/Apply";
import type { BlueprintFailure } from "@repo/domain/Blueprint";
import type { CatalogNotFound } from "@repo/domain/Catalog";
import type { PlanFailure } from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import { Context, Effect, Layer, Path, Schema } from "effect";
import { RecipePreview, RecipePreviewInput } from "../../RecipePreviewSchema";
import { ApplyWorkspaceService } from "../apply/ApplyWorkspaceService";
import { BlueprintService } from "../blueprint/BlueprintService";
import type { RecipeError } from "./RecipeErrors";
import { RecipeService } from "./RecipeService";

const StackConfigFromJsonString = Schema.fromJsonString(StackConfig, {
  space: 2,
});

export type { RecipePreview, RecipePreviewInput };
export {
  RecipePreview as RecipePreviewSchema,
  RecipePreviewInput as RecipePreviewInputSchema,
};

export type RecipePreviewError =
  | RecipeError
  | BlueprintFailure
  | PlanFailure
  | CatalogNotFound
  | ApplyFailure
  | StalePlanFailure;

export interface RecipePreviewServiceShape {
  readonly preview: (
    input: RecipePreviewInput,
  ) => Effect.Effect<RecipePreview, RecipePreviewError, never>;
}

export class RecipePreviewService extends Context.Service<
  RecipePreviewService,
  RecipePreviewServiceShape
>()("RecipePreviewService") {
  static readonly make = Effect.gen(function* () {
    const recipes = yield* RecipeService;
    const blueprints = yield* BlueprintService;
    const workspaces = yield* ApplyWorkspaceService;

    const preview: RecipePreviewServiceShape["preview"] = Effect.fn(
      "RecipePreviewService.preview",
    )(function* ({ recipe, config }) {
      const selection = yield* recipes.resolve(recipe, {
        config,
        providerStrategy: { _tag: "fail-on-ambiguous" },
      });
      const blueprint = yield* blueprints.resolve(selection, config);

      const workspace = yield* workspaces.create();
      const plan = yield* workspace.plan({ blueprint, config });
      const apply = new Apply({ plan, decisions: [] });
      const applied = yield* workspace.materialize(apply);
      const encodedConfig = yield* Schema.encodeEffect(
        StackConfigFromJsonString,
      )(config).pipe(
        Effect.mapError(
          (error) =>
            new ApplyFailure({
              reason: "executionFailure",
              message: `Could not serialize the preview configuration: ${error.message}`,
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

    return { preview } satisfies RecipePreviewServiceShape;
  });

  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(RecipeService.layer),
    Layer.provide(BlueprintService.layer),
    Layer.provide(CatalogService.layer),
    Layer.provide(
      ApplyWorkspaceService.layer.pipe(
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
