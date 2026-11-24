/**
 * Staged workspaces: private in-memory copies of a repository where a Plan can
 * be built and applied without writing to the host.
 */
import type { CatalogService } from "@repo/catalog";
import type {
  Apply,
  ApplyFailure,
  MaterializedApply,
  StalePlanFailure,
} from "@repo/domain/Apply";
import type { Blueprint } from "@repo/domain/Blueprint";
import type { CatalogNotFound } from "@repo/domain/Catalog";
import type { Plan, PlanBaseline, PlanFailure } from "@repo/domain/Plan";
import type { StackConfig } from "@repo/domain/StackConfig";
import {
  Context,
  type Effect,
  type FileSystem,
  Layer,
  type Path,
} from "effect";
import type * as Digest from "effect/crypto/Digest";
import type * as SecureRandom from "effect/crypto/SecureRandom";
import * as internal from "./internal/applyWorkspaces";
import { RepositoryState } from "./internal/repositoryState";

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
 * Use `ApplyService` to write to the repository itself.
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
    | CatalogService
  > = Layer.effect(ApplyWorkspaces, internal.make).pipe(
    Layer.provide(RepositoryState.layer),
  );
}
