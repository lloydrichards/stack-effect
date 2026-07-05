import { Schema } from "effect";
import { Argument, Flag } from "effect/unstable/cli";
import { RecipeTargetString } from "./lib/recipeTargets";

const TrimNonEmptyString = Schema.Trim.check(Schema.isNonEmpty());

export const projectNameArg = Argument.string("project-name").pipe(
  Argument.withSchema(TrimNonEmptyString),
  Argument.optional,
);

export const recipeTargetFlag = Flag.string("target").pipe(
  Flag.withSchema(RecipeTargetString),
  Flag.atLeast(1),
  Flag.optional,
  Flag.withMetavar("<targetKind>/<targetName>:<moduleId>[,...]"),
  Flag.withDescription(
    "Target spec as <targetKind>/<targetName>:<moduleId>[,<moduleId>...]",
  ),
);

export const rootFlag = Flag.directory("root").pipe(
  Flag.optional,
  Flag.withMetavar("<dir>"),
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

export const trustFlag = Flag.boolean("trust").pipe(
  Flag.withDescription(
    "Skip finalize script approval prompt and run all scripts",
  ),
);

export const runtimeFlag = Flag.choice("runtime", ["bun", "node"]).pipe(
  Flag.optional,
  Flag.withDescription("Runtime to use"),
);

export const packageManagerFlag = Flag.choice("package-manager", [
  "bun",
  "pnpm",
  "npm",
]).pipe(
  Flag.optional,
  Flag.withDescription(
    "Override the default package manager. bun implies --runtime bun; pnpm/npm imply --runtime node.",
  ),
);

export const monorepoFlag = Flag.string("monorepo").pipe(
  Flag.optional,
  Flag.withDescription("Override the default monorepo tool"),
);

export const lintFlag = Flag.string("lint").pipe(
  Flag.optional,
  Flag.withDescription("Override the default lint tool"),
);

export const formatFlag = Flag.string("format").pipe(
  Flag.optional,
  Flag.withDescription("Override the default format tool"),
);

export const testFlag = Flag.string("test").pipe(
  Flag.optional,
  Flag.withDescription("Override the default test framework"),
);
