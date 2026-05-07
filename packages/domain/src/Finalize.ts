import { Schema } from "effect";

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
  results: Schema.Array(
    Schema.Struct({
      label: Schema.String,
      command: Schema.String,
      workdir: Schema.String,
      status: Schema.Literals(["success", "failure"]),
      error: Schema.optional(Schema.String),
    }),
  ),
}) {
  get succeeded(): number {
    return this.results.filter((r) => r.status === "success").length;
  }
  get failed(): number {
    return this.results.length - this.succeeded;
  }
}
