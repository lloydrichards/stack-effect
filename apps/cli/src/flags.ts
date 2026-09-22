import { RecipeTargetString } from "@repo/scaffold";
import { Effect, Schema } from "effect";
import { Argument, Flag } from "effect/unstable/cli";

const TrimNonEmptyString = Schema.Trim.check(Schema.isNonEmpty());

export const projectNameArg = Argument.String("project-name").pipe(
  Argument.withSchema(TrimNonEmptyString),
  Argument.optional,
);

export const recipeTargetFlag = Flag.String("target").pipe(
  Flag.withSchema(RecipeTargetString),
  Flag.atLeast(1),
  Flag.optional,
  Flag.withMetavar("<targetKind>/<targetName>:<moduleId>[,...]"),
  Flag.withDescription(
    "Target spec as <targetKind>/<targetName>:<moduleId>[,<moduleId>...]",
  ),
);

export const rootFlag = Flag.Directory("root").pipe(
  Flag.optional,
  Flag.withMetavar("<dir>"),
  Flag.withDescription("Root directory of the repository (defaults to cwd)"),
  Flag.withAlias("r"),
);

export const dryRunFlag = Flag.Boolean("dry-run").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Preview changes without writing to disk"),
);

export const showFilesFlag = Flag.Boolean("show-files").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Include generated file contents in a dry-run preview"),
);

export const validateShowFiles = ({
  dryRun,
  showFiles,
}: {
  readonly dryRun: boolean;
  readonly showFiles: boolean;
}) =>
  showFiles && !dryRun
    ? Effect.fail("--show-files requires --dry-run.")
    : Effect.void;

export const yesFlag = Flag.Boolean("yes").pipe(
  Flag.withDefault(false),
  Flag.withAlias("y"),
  Flag.withDescription(
    "Skip confirmation prompts (uses defaults where available)",
  ),
);

export const noGitFlag = Flag.Boolean("no-git").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Skip git repository initialization"),
);

export const trustFlag = Flag.Boolean("trust").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    "Skip finalize script approval prompt and run all scripts",
  ),
);

export const runtimeFlag = Flag.Literals("runtime", ["bun", "node"]).pipe(
  Flag.optional,
  Flag.withDescription("Runtime to use"),
);

export const typescriptFlag = Flag.Literals("typescript", ["6", "7"]).pipe(
  Flag.optional,
  Flag.withDescription("TypeScript major version to configure"),
);

export const packageManagerFlag = Flag.Literals("package-manager", [
  "bun",
  "pnpm",
  "npm",
]).pipe(
  Flag.optional,
  Flag.withDescription(
    "Override the default package manager. bun implies --runtime bun; pnpm/npm imply --runtime node.",
  ),
);

export const monorepoFlag = Flag.String("monorepo").pipe(
  Flag.optional,
  Flag.withDescription("Override the default monorepo tool"),
);

export const lintFlag = Flag.String("lint").pipe(
  Flag.optional,
  Flag.withDescription("Override the default lint tool"),
);

export const formatFlag = Flag.String("format").pipe(
  Flag.optional,
  Flag.withDescription("Override the default format tool"),
);

export const testFlag = Flag.String("test").pipe(
  Flag.optional,
  Flag.withDescription("Override the default test framework"),
);
