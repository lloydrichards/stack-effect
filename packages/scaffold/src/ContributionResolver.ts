/**
 * Contribution resolution: collects the files and edits each Blueprint node
 * contributes, with catalog tokens resolved for its target.
 */
import type { CatalogService } from "@repo/catalog";
import type { Blueprint } from "@repo/domain/Blueprint";
import type { CatalogNotFound } from "@repo/domain/Catalog";
import type {
  NormalizedContributions,
  StackConfig,
} from "@repo/domain/Scaffold";
import { Context, type Effect, Layer } from "effect";
import * as internal from "./internal/contributionResolver";
import { RecipeService } from "./RecipeService";

/**
 * Resolves a Blueprint's contributions, grouped by target and module.
 *
 * **When to use**
 *
 * Inspect what a Blueprint would contribute without planning against a
 * repository, such as when authoring catalog modules. `PlanService` uses it
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
    CatalogService
  > = Layer.effect(ContributionResolver, internal.make).pipe(
    Layer.provide(RecipeService.layer),
  );
}
