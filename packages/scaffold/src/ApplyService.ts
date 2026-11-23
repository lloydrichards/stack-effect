/**
 * Apply: executes an Apply intent against a repository, writing each planned
 * file and composing the files several modules share.
 */
import type {
  Apply,
  ApplyFailure,
  ApplyResult,
  StalePlanFailure,
} from "@repo/domain/Apply";
import {
  Context,
  type Effect,
  type FileSystem,
  Layer,
  type Path,
} from "effect";
import type * as Digest from "effect/crypto/Digest";
import * as internal from "./internal/applyService";
import { AtomicWriter } from "./internal/atomicWriter";
import { RepositoryState } from "./internal/repositoryState";

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
export class ApplyService extends Context.Service<
  ApplyService,
  {
    readonly apply: (input: {
      readonly apply: Apply;
      readonly repositoryRoot: string;
    }) => Effect.Effect<ApplyResult, ApplyFailure | StalePlanFailure>;
  }
>()("@repo/scaffold/ApplyService") {
  static readonly layer: Layer.Layer<
    ApplyService,
    never,
    FileSystem.FileSystem | Path.Path | Digest.Digest
  > = Layer.effect(ApplyService, internal.make).pipe(
    Layer.provide(AtomicWriter.layer),
    Layer.provide(RepositoryState.layer),
  );
}
