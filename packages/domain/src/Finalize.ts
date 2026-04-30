import { Schema } from "effect";

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
