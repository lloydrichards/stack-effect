import { Schema } from "effect";
import { pathOrd, pathStrOrd } from "./Order";
import { Plan, RepositoryPath } from "./Plan";

/**
 * A user's resolution for a conflicted path: override existing content or
 * skip the file entirely.
 *
 * @category Apply
 * @since 1.0.0
 */
const ApplyDecision = Schema.Struct({
  path: RepositoryPath,
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
}) {}

export class ApplyFailure extends Schema.TaggedError<ApplyFailure>()(
  "ApplyFailure",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

const ApplyFailedPath = Schema.Struct({
  path: RepositoryPath,
  reason: Schema.String,
});

export type ApplyFailedPath = typeof ApplyFailedPath.Type;

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
  created: Schema.Array(RepositoryPath),
  modified: Schema.Array(RepositoryPath),
  skipped: Schema.Array(RepositoryPath),
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

const StalePlanChange = Schema.Struct({
  path: RepositoryPath,
  kind: Schema.Literals([
    "created",
    "deleted",
    "modified",
    "typeChanged",
    "rootChanged",
  ]),
});

export type StalePlanChange = typeof StalePlanChange.Type;

/** A Plan no longer describes the repository being previewed or written. */
export class StalePlanFailure extends Schema.TaggedError<StalePlanFailure>()(
  "StalePlanFailure",
  {
    message: Schema.String,
    changes: Schema.Array(StalePlanChange),
    partialResult: ApplyResult,
  },
) {}

/**
 * A file an Apply created or modified, read back with its final contents.
 *
 * **When to use**
 *
 * Present the result of an Apply that ran in a staged workspace.
 */
const MaterializedFile = Schema.Struct({
  path: RepositoryPath,
  status: Schema.Literals(["created", "modified"]),
  contents: Schema.String,
});

/**
 * The result of an Apply in a staged workspace, with the files it wrote.
 *
 * **When to use**
 *
 * Present or copy out what a staged Apply produced, without reading the
 * workspace filesystem.
 */
export const MaterializedApply = Schema.Struct({
  apply: ApplyResult,
  files: Schema.Array(MaterializedFile),
});

export type MaterializedApply = typeof MaterializedApply.Type;
