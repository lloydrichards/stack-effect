/**
 * Finalize: runs the post-apply scripts a Blueprint contributes and collects
 * its next steps.
 */
import type { CatalogReader } from "@repo/catalog/Catalog";
import type { Blueprint, CatalogNotFound } from "@repo/domain/Blueprint";
import type { FinalizeScript, ScriptResult } from "@repo/domain/Finalize";
import type { StackConfig } from "@repo/domain/StackConfig";
import {
  Context,
  type Effect,
  Layer,
  type PlatformError,
  type Scope,
  type Stream,
} from "effect";
import type { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import * as internal from "./internal/finalizer";

/**
 * The configuration and repository a Finalize run resolves scripts for.
 *
 * **When to use**
 *
 * Pass it to `Finalizer.scripts` and `collectNextSteps`.
 */
export type FinalizeConfig = {
  readonly config: StackConfig;
  readonly repositoryRoot: string;
};

/**
 * A running script: its merged output lines and its eventual result.
 *
 * **When to use**
 *
 * Read it from `Finalizer.executeScoped`.
 *
 * **Gotchas**
 *
 * Drain `output` before the owning Scope closes; closing it releases the
 * process.
 */
export type FinalizeExecution = {
  readonly output: Stream.Stream<string, PlatformError.PlatformError>;
  readonly result: Effect.Effect<ScriptResult, PlatformError.PlatformError>;
};

/**
 * Identifies one script for deduplication and selection.
 *
 * **When to use**
 *
 * Match a script a user selected or skipped against the scripts a run lists.
 *
 * **Gotchas**
 *
 * The source is part of the key, so a custom script can never stand in for an
 * official one.
 */
export const scriptKey: (script: {
  readonly command: string;
  readonly workdir: string;
  readonly source?: string | undefined;
}) => string = internal.scriptKey;

/**
 * Lists, runs, and summarizes the post-Apply steps of a Blueprint.
 *
 * **When to use**
 *
 * Run Finalize after Apply in a real repository. List the scripts first so the
 * user can confirm or skip them.
 *
 * **Gotchas**
 *
 * `scripts` returns them in run order: catalog `finalize` scripts, then
 * configuration scripts, then `post-finalize` scripts, with duplicates removed.
 */
export class Finalizer extends Context.Service<
  Finalizer,
  {
    readonly scripts: (
      blueprint: Blueprint,
      config: FinalizeConfig,
    ) => Effect.Effect<ReadonlyArray<FinalizeScript>, CatalogNotFound>;
    // The caller owns the Scope so it can drain output before the process is released.
    readonly executeScoped: (
      script: FinalizeScript,
      repositoryRoot: string,
    ) => Effect.Effect<
      FinalizeExecution,
      PlatformError.PlatformError,
      Scope.Scope
    >;
    readonly collectNextSteps: (
      blueprint: Blueprint,
      config: FinalizeConfig,
    ) => Effect.Effect<ReadonlyArray<string>, CatalogNotFound>;
  }
>()("@repo/scaffold/Finalizer") {
  static readonly layer: Layer.Layer<
    Finalizer,
    never,
    CatalogReader | ChildProcessSpawner
  > = Layer.effect(Finalizer, internal.make);
}
