import { Result, Schema } from "effect";

export const ScriptSuccess = Schema.Struct({
  label: Schema.String,
  command: Schema.String,
});

export const ScriptFailure = Schema.Struct({
  label: Schema.String,
  command: Schema.String,
  error: Schema.String,
});

export type ScriptResult = Result.Result<
  typeof ScriptSuccess.Type,
  typeof ScriptFailure.Type
>;

/**
 * Aggregated results of post-apply finalization scripts (install, format, etc.).
 *
 * The FinalizeReport is the terminal output of the scaffold pipeline. It
 * records which scripts succeeded and which failed, enabling the CLI to
 * present a summary to the user.
 *
 * @category Finalize
 * @since 1.0.0
 */
export class FinalizeReport extends Schema.Class<FinalizeReport>(
  "FinalizeReport",
)({
  results: Schema.Array(Schema.Result(ScriptSuccess, ScriptFailure)),
}) {
  get succeeded(): number {
    return this.results.filter(Result.isSuccess).length;
  }
  get failed(): number {
    return this.results.length - this.succeeded;
  }
}
