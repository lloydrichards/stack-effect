import { CatalogService } from "@repo/catalog";
import { Apply, ApplyFailure } from "@repo/domain/Apply";
import type { BlueprintFailure } from "@repo/domain/Blueprint";
import type { CatalogNotFound } from "@repo/domain/Catalog";
import type { PlanFailure } from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/Scaffold";
import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect";
import * as MemoryFileSystem from "../../MemoryFileSystem";
import {
  type RecipePreview,
  type RecipePreviewInput,
  RecipePreviewInputSchema,
  RecipePreviewSchema,
} from "../../RecipePreviewSchema";
import { ApplyPreviewService } from "../apply/ApplyPreviewService";
import { BlueprintService } from "../blueprint/BlueprintService";
import { PlanService } from "../plan/PlanService";
import type { RecipeError } from "./RecipeErrors";
import { RecipeService } from "./RecipeService";

export type { RecipePreview, RecipePreviewInput };
export { RecipePreviewInputSchema, RecipePreviewSchema };

export type RecipePreviewError =
  | RecipeError
  | BlueprintFailure
  | PlanFailure
  | CatalogNotFound
  | ApplyFailure;

export interface RecipePreviewServiceShape {
  readonly preview: (
    input: RecipePreviewInput,
  ) => Effect.Effect<RecipePreview, RecipePreviewError, never>;
}

const workspaceRoot = "/workspace";

export class RecipePreviewService extends Context.Service<
  RecipePreviewService,
  RecipePreviewServiceShape
>()("RecipePreviewService") {
  static readonly make = Effect.gen(function* () {
    const recipes = yield* RecipeService;
    const blueprints = yield* BlueprintService;

    const preview: RecipePreviewServiceShape["preview"] = Effect.fn(
      "RecipePreviewService.preview",
    )(function* ({ recipe, config }) {
      const selection = yield* recipes.resolve(recipe, {
        config,
        providerStrategy: { _tag: "fail-on-ambiguous" },
      });
      const blueprint = yield* blueprints.resolve(selection);

      const fileSystem = yield* MemoryFileSystem.make;
      const path = yield* Path.Path.pipe(Effect.provide(Path.layer));
      yield* fileSystem.makeDirectory(workspaceRoot, { recursive: true }).pipe(
        Effect.mapError(
          (error) =>
            new ApplyFailure({
              reason: "executionFailure",
              message: `Could not initialize the preview workspace: ${error.message}`,
            }),
        ),
      );

      const fileSystemLayer = Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, fileSystem),
        Layer.succeed(Path.Path, path),
      );
      const plan = yield* Effect.gen(function* () {
        const plans = yield* PlanService;
        return yield* plans.build({
          blueprint,
          repoRoot: workspaceRoot,
          config,
        });
      }).pipe(
        Effect.provide(PlanService.layer.pipe(Layer.provide(fileSystemLayer))),
      );
      const apply = new Apply({ plan, decisions: [] });
      const applied = yield* Effect.gen(function* () {
        const previews = yield* ApplyPreviewService;
        return yield* previews.preview({ apply, repoRoot: workspaceRoot });
      }).pipe(
        Effect.provide(
          ApplyPreviewService.layer.pipe(Layer.provide(fileSystemLayer)),
        ),
      );
      const encodedConfig = Schema.encodeSync(StackConfig)(config);
      const configContents = `${JSON.stringify(encodedConfig, null, 2)}\n`;

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
  );
}
