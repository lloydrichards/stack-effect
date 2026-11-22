import { Console, Context, Data, Effect, Layer } from "effect";

export interface IssueOpened {
  readonly repository: string;
  readonly issueNumber: number;
}

export const chooseIssueLabel = (event: IssueOpened) => ({
  ...event,
  label: "triage" as const,
});

export class GitHubLabelError extends Data.TaggedError("GitHubLabelError") {}

export class GitHubLabels extends Context.Service<
  GitHubLabels,
  {
    readonly add: (
      decision: ReturnType<typeof chooseIssueLabel>,
    ) => Effect.Effect<void, GitHubLabelError>;
  }
>()("example/GitHubLabels") {}

export const GitHubLabelsDemo = Layer.succeed(GitHubLabels, {
  add: Effect.fn("GitHubLabels.add")(({ repository, issueNumber, label }) =>
    Console.log(`Would add ${label} to ${repository}#${issueNumber}`),
  ),
});
