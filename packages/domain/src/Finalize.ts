import { Effect, Result, Schema } from "effect";
import { RepositoryPath } from "./Plan";

const ScriptSuccess = Schema.Struct({
  label: Schema.String,
  command: Schema.String,
});

const ScriptFailure = Schema.Struct({
  label: Schema.String,
  command: Schema.String,
  error: Schema.String,
});

export type ScriptSuccess = typeof ScriptSuccess.Type;

export type ScriptFailure = typeof ScriptFailure.Type;

export type ScriptResult = Result.Result<ScriptSuccess, ScriptFailure>;

const SkippedScript = Schema.Struct({
  label: Schema.String,
  command: Schema.String,
  workdir: RepositoryPath,
});

const ConflictedFile = Schema.Struct({
  path: RepositoryPath,
  patchPath: RepositoryPath,
});

/**
 * Aggregated results of post-apply finalization scripts (install, format, etc.).
 *
 * The FinalizeReport is the terminal output of the scaffold pipeline. It
 * records which scripts succeeded and which failed, enables the CLI to
 * present a summary to the user, and surfaces skipped scripts and unresolved
 * conflicts for manual resolution.
 *
 * @category Finalize
 * @since 1.0.0
 */
export class FinalizeReport extends Schema.Class<FinalizeReport>(
  "FinalizeReport",
)({
  results: Schema.Array(Schema.Result(ScriptSuccess, ScriptFailure)),
  skippedScripts: Schema.Array(SkippedScript).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  conflicts: Schema.Array(ConflictedFile).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
  nextSteps: Schema.Array(Schema.String).pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed([])),
  ),
}) {
  get succeeded(): number {
    return this.results.filter(Result.isSuccess).length;
  }
  get failed(): number {
    return this.results.length - this.succeeded;
  }
}

/**
 * One shell command to run after Apply, resolved for a target's directory.
 *
 * **When to use**
 *
 * List, confirm, or run the scripts a Blueprint needs once its files exist.
 *
 * **Gotchas**
 *
 * `workdir` is relative to the repository root, and `"."` means the root.
 * Scripts from a custom catalog carry `source`, so callers can ask before
 * running them.
 */
export const FinalizeScript = Schema.Struct({
  label: Schema.String,
  command: Schema.String,
  workdir: Schema.String,
  phase: Schema.Literals(["finalize", "config", "post-finalize"]),
  origin: Schema.String,
  /** Selected catalog source that contributed the script, when sources are named. */
  source: Schema.optionalKey(Schema.String),
});

export type FinalizeScript = typeof FinalizeScript.Type;
