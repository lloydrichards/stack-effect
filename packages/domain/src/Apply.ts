import { Schema } from "effect";
import { pathOrd, pathStrOrd } from "./Order";
import { Plan } from "./Plan";

/**
 * A user's resolution for a conflicted path: override existing content or
 * skip the file entirely.
 *
 * @category Apply
 * @since 1.0.0
 */
export const ApplyDecision = Schema.Struct({
  path: Schema.String,
  value: Schema.Literals(["override", "skip"]),
});

/**
 * Combines a Plan with user decisions for all conflicted paths, forming the
 * complete execution intent.
 *
 * An Apply is valid only when every conflict in the Plan has a corresponding
 * ApplyDecision — missing or extra decisions are invalid.
 *
 * @category Apply
 * @since 1.0.0
 */
export class Apply extends Schema.Class<Apply>("Apply")({
  plan: Plan,
  decisions: Schema.Array(ApplyDecision),
}) {
  toSorted(): Apply {
    return new Apply({
      plan: this.plan.toSorted(),
      decisions: [...this.decisions].sort(pathOrd),
    });
  }
}

export class ApplyFailure extends Schema.TaggedErrorClass<ApplyFailure>()(
  "ApplyFailure",
  {
    reason: Schema.Literals([
      "invalidApplyIntent",
      "repoRootInvalid",
      "executionFailure",
    ]),
    message: Schema.String,
  },
) {}

export const ApplyFailedPath = Schema.Struct({
  path: Schema.String,
  reason: Schema.String,
});

/**
 * The outcome of executing an Apply against the filesystem.
 *
 * Categorizes every path by what happened: created, modified, skipped (by
 * user decision), or failed (due to execution errors). Provides a complete
 * audit trail for the FinalizeReport.
 *
 * @category Apply
 * @since 1.0.0
 */
export class ApplyResult extends Schema.Class<ApplyResult>("ApplyResult")({
  created: Schema.Array(Schema.String),
  modified: Schema.Array(Schema.String),
  skipped: Schema.Array(Schema.String),
  failed: Schema.Array(ApplyFailedPath),
}) {
  toSorted(): ApplyResult {
    return new ApplyResult({
      created: [...this.created].sort(pathStrOrd),
      modified: [...this.modified].sort(pathStrOrd),
      skipped: [...this.skipped].sort(pathStrOrd),
      failed: [...this.failed].sort(pathOrd),
    });
  }
}
