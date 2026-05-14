import { Flag } from "effect/unstable/cli";

export const rootFlag = Flag.directory("root").pipe(
  Flag.optional,
  Flag.withDescription("Root directory of the repository (defaults to cwd)"),
  Flag.withAlias("r"),
);

export const dryRunFlag = Flag.boolean("dry-run").pipe(
  Flag.withDescription("Preview changes without writing to disk"),
);

export const yesFlag = Flag.boolean("yes").pipe(
  Flag.withAlias("y"),
  Flag.withDescription(
    "Skip confirmation prompts (uses defaults where available)",
  ),
);

export const noGitFlag = Flag.boolean("no-git").pipe(
  Flag.withDescription("Skip git repository initialization"),
);
