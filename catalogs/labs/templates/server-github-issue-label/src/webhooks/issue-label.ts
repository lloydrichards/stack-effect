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
  static readonly layer = Layer.succeed(GitHubLabels, {
    add: Effect.fn("GitHubLabels.add")(function* ({
      repository,
      issueNumber,
      label,
    }) {
      // NOTE: Replace this log with an authenticated call to GitHub's add-labels endpoint. Keep replays safe by adding the same label.
      yield* Console.log(`Would add ${label} to ${repository}#${issueNumber}`);
    }),
  });
}
