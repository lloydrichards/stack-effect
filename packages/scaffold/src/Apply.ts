/**
 * Apply: executes a decided Plan against a repository, stages Plans in
 * isolated workspaces, and previews a recipe's files in memory.
 */
import type { CatalogReader } from "@repo/catalog/Catalog";
import {
  Apply,
  ApplyFailure,
  type ApplyResult,
  type MaterializedApply,
  type StalePlanFailure,
} from "@repo/domain/Apply";
import type { Blueprint, BlueprintFailure } from "@repo/domain/Blueprint";
import type { CatalogNotFound } from "@repo/domain/Catalog";
import type { Plan, PlanBaseline, PlanFailure } from "@repo/domain/Plan";
import {
  RecipePreview,
  type RecipePreviewInput,
  type RecipeResolveError,
  RecipeResolveOptions,
} from "@repo/domain/Recipe";
import { StackConfig } from "@repo/domain/StackConfig";
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
import { BlueprintResolver } from "./Blueprint";
import * as applier from "./internal/applier";
import * as applyWorkspaces from "./internal/applyWorkspaces";
import { AtomicWriter } from "./internal/atomicWriter";
import { RepositoryState } from "./internal/repositoryState";
import { RecipeResolver } from "./Recipe";

/**
 * Writes the outcomes of a Plan, resolved by its ApplyDecisions, under a
 * repository root.
 *
 * **When to use**
 *
 * Run it after the user has decided every conflict in a Plan. To preview the
 * result without touching the repository, use `ApplyWorkspaces` instead.
 *
 * **Gotchas**
 *
 * Apply re-checks the repository against the Plan's baseline and fails with
 * `StalePlanFailure` when it changed since planning. Writes are atomic per
 * file, not across the repository, so a failure can leave earlier files
 * written; the result lists every path by outcome.
 */
export class Applier extends Context.Service<
  Applier,
  {
    readonly apply: (input: {
      readonly apply: Apply;
      readonly repositoryRoot: string;
    }) => Effect.Effect<ApplyResult, ApplyFailure | StalePlanFailure>;
  }
>()("@repo/scaffold/Applier") {
  static readonly layer: Layer.Layer<
    Applier,
    never,
    FileSystem.FileSystem | Path.Path | Digest.Digest
  > = Layer.effect(Applier, applier.makeApplier).pipe(
    Layer.provide(AtomicWriter.layer),
    Layer.provide(RepositoryState.layer),
  );
}

/**
 * One staged workspace: plan inside it, then apply and read back the files.
 *
 * **When to use**
 *
 * Open one from `ApplyWorkspaces` for a preview or dry run.
 *
 * **Gotchas**
 *
 * `materialize` accepts a Plan built in this workspace, or a host Plan whose
 * baseline matches the paths the workspace was seeded from. Anything else
 * fails as stale.
 */
export type ApplyWorkspace = {
  readonly plan: (input: {
    readonly blueprint: Blueprint;
    readonly config: StackConfig;
  }) => Effect.Effect<Plan, PlanFailure | CatalogNotFound>;
  readonly materialize: (
    apply: Apply,
  ) => Effect.Effect<MaterializedApply, ApplyFailure | StalePlanFailure>;
};

/**
 * Opens staged workspaces, empty or seeded from a host repository.
 *
 * **When to use**
 *
 * Preview what Apply would write: Recipe Builder previews and CLI dry runs.
 * Use `Applier` to write to the repository itself.
 *
 * **Gotchas**
 *
 * `fromRepository` copies only the paths the host Plan captured plus each
 * package owner's manifest, and fails with `StalePlanFailure` when they
 * changed since planning.
 */
export class ApplyWorkspaces extends Context.Service<
  ApplyWorkspaces,
  {
    /** Opens a workspace with no repository files, for plans built inside it. */
    readonly empty: Effect.Effect<ApplyWorkspace, ApplyFailure>;
    /** Opens a workspace seeded with the repository paths a host Plan captured. */
    readonly fromRepository: (input: {
      readonly repositoryRoot: string;
      readonly baseline: PlanBaseline;
    }) => Effect.Effect<ApplyWorkspace, ApplyFailure | StalePlanFailure>;
  }
>()("@repo/scaffold/ApplyWorkspaces") {
  static readonly layer: Layer.Layer<
    ApplyWorkspaces,
    never,
    | FileSystem.FileSystem
    | Path.Path
    | Digest.Digest
    | SecureRandom.SecureRandom
    | CatalogReader
  > = Layer.effect(
    ApplyWorkspaces,
    applyWorkspaces.makeApplyWorkspaces(Applier),
  ).pipe(Layer.provide(RepositoryState.layer));
}

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
    | CatalogReader
    | FileSystem.FileSystem
    | Path.Path
    | Digest.Digest
    | SecureRandom.SecureRandom
  > = Layer.effect(
    RecipePreviewer,
    Effect.gen(function* () {
      const recipes = yield* RecipeResolver;
      const blueprints = yield* BlueprintResolver;
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
    Layer.provide(RecipeResolver.layer),
    Layer.provide(BlueprintResolver.layer),
    Layer.provide(ApplyWorkspaces.layer),
  );
}
