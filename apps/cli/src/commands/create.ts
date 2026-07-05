import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import type { RecipeSpec, RecipeTargetSpec } from "@repo/domain/Recipe";
import { StackConfig } from "@repo/domain/Scaffold";
import { Console, Effect, Option, Schema } from "effect";
import { Command } from "effect/unstable/cli";
import {
  dryRunFlag,
  formatFlag,
  lintFlag,
  monorepoFlag,
  noGitFlag,
  packageManagerFlag,
  projectNameArg,
  recipeTargetFlag,
  rootFlag,
  runtimeFlag,
  testFlag,
  trustFlag,
  yesFlag,
} from "../flags";
import { resolveNameAndRoot } from "../lib/project";
import { encodeRecipeTargetSpecs } from "../lib/recipeTargets";
import { CONFIG_FILENAME, ConfigureService } from "../service/ConfigureService";
import { RecipeService } from "../service/RecipeService";
import { ScaffoldPipeline } from "../service/ScaffoldPipeline";

const DEFAULTS = {
  runtime: "bun",
  packageManager: "bun",
  monorepo: "turbo",
  lint: "biome",
  format: "biome",
  test: "vitest",
} as const;

const quoteShellArg = (value: string) =>
  /^[A-Za-z0-9_./:,@+-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;

const validateRuntimeOptions = Effect.fn("create.validateRuntimeOptions")(
  function* ({
    runtime,
    packageManager,
  }: {
    readonly runtime: Option.Option<"bun" | "node">;
    readonly packageManager: Option.Option<"bun" | "pnpm" | "npm">;
  }) {
    if (
      Option.isSome(runtime) &&
      runtime.value === "bun" &&
      Option.isSome(packageManager) &&
      packageManager.value !== "bun"
    ) {
      return yield* Effect.fail(
        `Invalid create options: --runtime bun conflicts with --package-manager ${packageManager.value}.`,
      );
    }

    if (
      Option.isSome(runtime) &&
      runtime.value === "node" &&
      Option.isSome(packageManager) &&
      packageManager.value === "bun"
    ) {
      return yield* Effect.fail(
        "Invalid create options: --runtime node conflicts with --package-manager bun.",
      );
    }
  },
);

const buildConfig = ({
  projectName,
  runtime,
  packageManager,
  monorepo,
  lint,
  format,
  test,
}: {
  readonly projectName: string;
  readonly runtime: Option.Option<"bun" | "node">;
  readonly packageManager: Option.Option<"bun" | "pnpm" | "npm">;
  readonly monorepo: Option.Option<string>;
  readonly lint: Option.Option<string>;
  readonly format: Option.Option<string>;
  readonly test: Option.Option<string>;
}): typeof StackConfig.Type => {
  const packageManagerName = Option.getOrElse(
    packageManager,
    () => DEFAULTS.packageManager,
  );
  const runtimeName = Option.getOrElse(
    runtime,
    () => (packageManagerName === "bun" ? "bun" : "node") as "bun" | "node",
  );
  const runtimeConfig =
    runtimeName === "bun"
      ? ({ _tag: "bun" } as const)
      : ({
          _tag: "node",
          packageManager:
            packageManagerName === "bun" ? "pnpm" : packageManagerName,
        } as const);

  return new StackConfig({
    name: projectName as typeof Schema.NonEmptyString.Type,
    runtime: runtimeConfig,
    monorepo: Option.getOrElse(monorepo, () => DEFAULTS.monorepo),
    lint: Option.getOrElse(lint, () => DEFAULTS.lint),
    format: Option.getOrElse(format, () => DEFAULTS.format),
    test: Option.getOrElse(test, () => DEFAULTS.test),
  });
};

const buildRecipeSpec = (
  targets: ReadonlyArray<RecipeTargetSpec>,
  includeGit: boolean,
): RecipeSpec => ({
  targets: [
    ...(includeGit
      ? [
          {
            target: new TargetIdentity({
              kind: TargetKind.make("workspace"),
              name: "",
            }),
            modules: [ModuleId.make("workspace-devenv-git")],
          },
        ]
      : []),
    ...targets,
  ],
});

const renderCreateCommand = ({
  name,
  targets,
  runtime,
  packageManager,
  monorepo,
  lint,
  format,
  test,
  noGit,
}: {
  readonly name: string;
  readonly targets: ReadonlyArray<RecipeTargetSpec>;
  readonly runtime: Option.Option<"bun" | "node">;
  readonly packageManager: Option.Option<"bun" | "pnpm" | "npm">;
  readonly monorepo: Option.Option<string>;
  readonly lint: Option.Option<string>;
  readonly format: Option.Option<string>;
  readonly test: Option.Option<string>;
  readonly noGit: boolean;
}) =>
  [
    "stack-effect",
    "create",
    quoteShellArg(name),
    ...encodeRecipeTargetSpecs(targets).flatMap((target) => [
      "--target",
      quoteShellArg(target),
    ]),
    ...Option.match(runtime, {
      onNone: () => [],
      onSome: (value) =>
        value === DEFAULTS.runtime ? [] : ["--runtime", value],
    }),
    ...Option.match(packageManager, {
      onNone: () => [],
      onSome: (value) =>
        value === DEFAULTS.packageManager ? [] : ["--package-manager", value],
    }),
    ...Option.match(monorepo, {
      onNone: () => [],
      onSome: (value) =>
        value === DEFAULTS.monorepo ? [] : ["--monorepo", quoteShellArg(value)],
    }),
    ...Option.match(lint, {
      onNone: () => [],
      onSome: (value) =>
        value === DEFAULTS.lint ? [] : ["--lint", quoteShellArg(value)],
    }),
    ...Option.match(format, {
      onNone: () => [],
      onSome: (value) =>
        value === DEFAULTS.format ? [] : ["--format", quoteShellArg(value)],
    }),
    ...Option.match(test, {
      onNone: () => [],
      onSome: (value) =>
        value === DEFAULTS.test ? [] : ["--test", quoteShellArg(value)],
    }),
    ...(noGit ? ["--no-git"] : []),
  ].join(" ");

export const create = Command.make(
  "create",
  {
    name: projectNameArg,
    target: recipeTargetFlag,
    root: rootFlag,
    runtime: runtimeFlag,
    packageManager: packageManagerFlag,
    monorepo: monorepoFlag,
    lint: lintFlag,
    format: formatFlag,
    test: testFlag,
    noGit: noGitFlag,
    yes: yesFlag,
    trust: trustFlag,
    dryRun: dryRunFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const configure = yield* ConfigureService;
      const pipeline = yield* ScaffoldPipeline;
      const recipes = yield* RecipeService;

      if (Option.isNone(flags.name)) {
        return yield* Effect.fail(
          "Project name is required. Use a name such as 'chat-app', or '.' for the resolved --root directory.",
        );
      }

      if (Option.isNone(flags.target)) {
        return yield* Effect.fail(
          "At least one --target is required for non-interactive create.",
        );
      }

      yield* validateRuntimeOptions({
        runtime: flags.runtime,
        packageManager: flags.packageManager,
      });

      const { projectName, repoRoot } = yield* resolveNameAndRoot(
        flags.name.value,
        flags.root,
      );
      const config = buildConfig({
        projectName,
        runtime: flags.runtime,
        packageManager: flags.packageManager,
        monorepo: flags.monorepo,
        lint: flags.lint,
        format: flags.format,
        test: flags.test,
      });
      const recipeSpec = buildRecipeSpec(flags.target.value, !flags.noGit);
      const selection = yield* recipes.resolve(recipeSpec, {
        config,
        providerStrategy: { _tag: "fail-on-ambiguous" },
      });

      const existing = yield* configure
        .readConfig(repoRoot)
        .pipe(Effect.option);

      if (Option.isSome(existing)) {
        return yield* Effect.fail(
          `${CONFIG_FILENAME} already exists at ${configure.configPath(
            repoRoot,
          )}. This looks like an existing stack-effect project; use 'stack-effect init' and 'stack-effect add' for existing or incremental workflows.`,
        );
      }

      yield* Console.log(
        `Create command: ${renderCreateCommand({
          name: flags.name.value,
          targets: flags.target.value,
          runtime: flags.runtime,
          packageManager: flags.packageManager,
          monorepo: flags.monorepo,
          lint: flags.lint,
          format: flags.format,
          test: flags.test,
          noGit: flags.noGit,
        })}`,
      );

      if (!flags.dryRun) {
        yield* configure.writeConfig(repoRoot, config);
        yield* Console.log(`\nWritten ${CONFIG_FILENAME}`);
      }

      yield* pipeline.run({
        selection,
        repoRoot,
        yes: flags.yes,
        dryRun: flags.dryRun,
        trust: flags.trust || flags.yes,
        config,
      });
    }),
).pipe(
  Command.withDescription(
    "Create a greenfield stack-effect project from compact target specs.",
  ),
  Command.withShortDescription("Create a full project in one command"),
  Command.withExamples([
    {
      command:
        "stack-effect create chat-app --target client-react/web:client-react-chat",
      description:
        "Create a full-stack chat app, expanding default targets and required dependencies",
    },
    {
      command:
        "stack-effect create chat-app --target client-react/web:client-react-chat --target package/ai:package-ai-chat-service,package-ai-toolkit-math --dry-run",
      description: "Preview a create command without writing files",
    },
  ]),
);
