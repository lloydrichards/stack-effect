import type {
  GitHubLabelError,
  IssueLabelDecision,
  IssueOpened,
} from "@repo/domain/GitHubIssueEvent";
import { Console, Context, Effect, Layer } from "effect";

export const chooseIssueLabel = (event: IssueOpened): IssueLabelDecision => ({
  ...event,
  label: "triage",
});

export class GitHubLabels extends Context.Service<
  GitHubLabels,
  {
    readonly add: (
      decision: IssueLabelDecision,
    ) => Effect.Effect<void, GitHubLabelError>;
  }
>()("example/GitHubLabels") {
  static readonly layerDemo = Layer.succeed(GitHubLabels, {
    add: Effect.fn("GitHubLabels.add")(({ repository, issueNumber, label }) =>
      Console.log(`Would add ${label} to ${repository}#${issueNumber}`),
    ),
  });
}
