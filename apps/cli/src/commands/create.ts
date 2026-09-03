import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import type { RecipeSpec, RecipeTargetSpec } from "@repo/domain/Recipe";
import { StackConfig } from "@repo/domain/Scaffold";
import { RecipeService, StackConfigDefaults } from "@repo/scaffold";
import { Array as Arr, Console, Effect, Option, Schema } from "effect";
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
  showFilesFlag,
  testFlag,
  trustFlag,
  typescriptFlag,
  validateShowFiles,
  yesFlag,
} from "../flags";
import { resolveNameAndRoot } from "../lib/project";
import { CONFIG_FILENAME, ConfigureService } from "../service/ConfigureService";
import { ScaffoldPipeline } from "../service/ScaffoldPipeline";

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
  typescript,
  monorepo,
  lint,
  format,
  test,
  defaults,
}: {
  readonly projectName: string;
  readonly runtime: Option.Option<"bun" | "node">;
  readonly packageManager: Option.Option<"bun" | "pnpm" | "npm">;
  readonly typescript: Option.Option<"6" | "7">;
  readonly monorepo: Option.Option<string>;
  readonly lint: Option.Option<string>;
  readonly format: Option.Option<string>;
  readonly test: Option.Option<string>;
  readonly defaults: StackConfig;
}): typeof StackConfig.Type => {
  const packageManagerName = Option.getOrElse(
    packageManager,
    () => defaults.packageManagerName,
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
    typescript: Option.getOrElse(typescript, () => defaults.typescriptVersion),
    monorepo: Option.getOrElse(monorepo, () => defaults.monorepo),
    lint: Option.getOrElse(lint, () => defaults.lint),
    format: Option.getOrElse(format, () => defaults.format),
    test: Option.getOrElse(test, () => defaults.test),
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

export const create = Command.make(
  "create",
  {
    name: projectNameArg,
    target: recipeTargetFlag,
    root: rootFlag,
    runtime: runtimeFlag,
    packageManager: packageManagerFlag,
    typescript: typescriptFlag,
    monorepo: monorepoFlag,
    lint: lintFlag,
    format: formatFlag,
    test: testFlag,
    noGit: noGitFlag,
    yes: yesFlag,
    trust: trustFlag,
    dryRun: dryRunFlag,
    showFiles: showFilesFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      yield* validateShowFiles(flags);
      const configure = yield* ConfigureService;
      const pipeline = yield* ScaffoldPipeline;
      const recipes = yield* RecipeService;
      const defaults = yield* StackConfigDefaults;

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
      if (
        flags.noGit &&
        Arr.some(flags.target.value, (target) =>
          Arr.some(
            target.modules,
            (moduleId) => moduleId === "workspace-devenv-husky",
          ),
        )
      ) {
        return yield* Effect.fail(
          "Invalid create options: Husky requires Git; --no-git cannot be used when selecting workspace-devenv-husky.",
        );
      }

      const { projectName, repoRoot } = yield* resolveNameAndRoot(
        flags.name.value,
        flags.root,
      );
      const config = buildConfig({
        projectName,
        runtime: flags.runtime,
        packageManager: flags.packageManager,
        typescript: flags.typescript,
        monorepo: flags.monorepo,
        lint: flags.lint,
        format: flags.format,
        test: flags.test,
        defaults,
      });
      const recipeSpec = buildRecipeSpec(flags.target.value, !flags.noGit);
      const selection = yield* recipes.resolve(recipeSpec, {
        config,
        providerStrategy: { _tag: "fail-on-ambiguous" },
      });
      const createCommand = recipes.renderCreateCommand({ config, selection });

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

      if (!flags.dryRun) {
        yield* Console.log(`Create command: ${createCommand}`);
      }

      if (!flags.dryRun) {
        yield* configure.writeConfig(repoRoot, config);
        yield* Console.log(`\nWritten ${CONFIG_FILENAME}`);
      }

      yield* pipeline.run({
        selection,
        repoRoot,
        yes: flags.yes,
        dryRun: flags.dryRun,
        showFiles: flags.showFiles,
        trust: flags.trust || flags.yes,
        config,
        createCommand,
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
        "stack-effect create chat-app --target client-react/web:client-react-chat --target package/ai:package-ai-chat-service,package-ai-chat-toolkit-math --dry-run",
      description: "Preview a create command without writing files",
    },
  ]),
);
