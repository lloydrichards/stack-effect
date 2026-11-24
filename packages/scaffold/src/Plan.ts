/**
 * Planning: collects each Blueprint node's contributions and assesses them
 * against the repository to produce a Plan of per-path outcomes.
 */
import type { CatalogReader } from "@repo/catalog/Catalog";
import type { Blueprint } from "@repo/domain/Blueprint";
import type { CatalogNotFound } from "@repo/domain/Catalog";
import type {
  NormalizedContributions,
  Plan,
  PlanFailure,
} from "@repo/domain/Plan";
import type { StackConfig } from "@repo/domain/StackConfig";
import {
  Context,
  type Effect,
  type FileSystem,
  Layer,
  type Path,
} from "effect";
import type * as Digest from "effect/crypto/Digest";
import * as contributionResolver from "./internal/contributionResolver";
import * as planner from "./internal/planner";
import { RepositoryState } from "./internal/repositoryState";
import { RecipeResolver } from "./Recipe";

/**
 * Resolves a Blueprint's contributions, grouped by target and module.
 *
 * **When to use**
 *
 * Inspect what a Blueprint would contribute without planning against a
 * repository, such as when authoring catalog modules. `Planner` uses it
 * to build Plans.
 *
 * **Gotchas**
 *
 * File contributions whose path resolves to an empty string are dropped.
 */
export class ContributionResolver extends Context.Service<
  ContributionResolver,
  {
    readonly resolve: (
      blueprint: Blueprint,
      config: StackConfig,
    ) => Effect.Effect<NormalizedContributions, CatalogNotFound>;
  }
>()("@repo/scaffold/ContributionResolver") {
  static readonly layer: Layer.Layer<
    ContributionResolver,
    never,
    CatalogReader
  > = Layer.effect(
    ContributionResolver,
    contributionResolver.makeContributionResolver,
  ).pipe(Layer.provide(RecipeResolver.layer));
}

/**
 * Builds a repository-aware Plan for a Blueprint.
 *
 * **When to use**
 *
 * Plan before Apply, then ask the user for one ApplyDecision per conflicted
 * path. Identical Blueprints and repository contents produce identical Plans.
 *
 * **Gotchas**
 *
 * The Plan records a baseline of every path it read. If the repository
 * changes while planning, `build` fails; if it changes before Apply, Apply
 * fails as stale. Plan never decides how to resolve a conflict.
 */
export class Planner extends Context.Service<
  Planner,
  {
    readonly build: (input: {
      readonly blueprint: Blueprint;
      readonly repositoryRoot: string;
      readonly config: StackConfig;
    }) => Effect.Effect<Plan, PlanFailure | CatalogNotFound>;
  }
>()("@repo/scaffold/Planner") {
  static readonly layer: Layer.Layer<
    Planner,
    never,
    CatalogReader | FileSystem.FileSystem | Path.Path | Digest.Digest
  > = Layer.effect(Planner, ContributionResolver.use(planner.makePlanner)).pipe(
    Layer.provide(ContributionResolver.layer),
    Layer.provide(RepositoryState.layer),
  );
}
