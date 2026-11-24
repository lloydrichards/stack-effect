/**
 * Plan: compares the files a Blueprint would contribute with a repository and
 * records each path's outcome and conflicts, without writing anything.
 */
import type { CatalogService } from "@repo/catalog";
import type { Blueprint } from "@repo/domain/Blueprint";
import type { CatalogNotFound } from "@repo/domain/Catalog";
import type { Plan, PlanFailure } from "@repo/domain/Plan";
import type { StackConfig } from "@repo/domain/StackConfig";
import {
  Context,
  type Effect,
  type FileSystem,
  Layer,
  type Path,
} from "effect";
import type * as Digest from "effect/crypto/Digest";
import { ContributionResolver } from "./ContributionResolver";
import * as internal from "./internal/planService";
import { RepositoryState } from "./internal/repositoryState";

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
export class PlanService extends Context.Service<
  PlanService,
  {
    readonly build: (input: {
      readonly blueprint: Blueprint;
      readonly repositoryRoot: string;
      readonly config: StackConfig;
    }) => Effect.Effect<Plan, PlanFailure | CatalogNotFound>;
  }
>()("@repo/scaffold/PlanService") {
  static readonly layer: Layer.Layer<
    PlanService,
    never,
    CatalogService | FileSystem.FileSystem | Path.Path | Digest.Digest
  > = Layer.effect(PlanService, internal.make).pipe(
    Layer.provide(ContributionResolver.layer),
    Layer.provide(RepositoryState.layer),
  );
}
