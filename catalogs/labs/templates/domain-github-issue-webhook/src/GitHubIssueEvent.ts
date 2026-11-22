import { Schema } from "effect";

const RepositoryName = Schema.NonEmptyString;
const IssueNumber = Schema.Int.check(Schema.isGreaterThan(0));

export const GitHubIssueEvent = Schema.Struct({
  action: Schema.String,
  repository: Schema.Struct({ full_name: RepositoryName }),
  issue: Schema.Struct({ number: IssueNumber }),
});

export const IssueOpened = Schema.Struct({
  repository: RepositoryName,
  issueNumber: IssueNumber,
});
export type IssueOpened = typeof IssueOpened.Type;

export const IssueLabelDecision = Schema.Struct({
  ...IssueOpened.fields,
  label: Schema.Literal("triage"),
});
export type IssueLabelDecision = typeof IssueLabelDecision.Type;

export const GitHubLabelError = Schema.TaggedStruct("GitHubLabelError", {});
export type GitHubLabelError = typeof GitHubLabelError.Type;
