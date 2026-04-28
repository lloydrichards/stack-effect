import { Schema } from "effect";
import { pathOrd, pathStrOrd } from "./Order";
import { Plan } from "./Plan";

export const ApplyDecision = Schema.Struct({
  path: Schema.String,
  value: Schema.Literals(["override", "skip"]),
});

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
