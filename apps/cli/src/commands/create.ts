import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import type { RecipeSpec, RecipeTargetSpec } from "@repo/domain/Recipe";
import { StackConfig } from "@repo/domain/Scaffold";
import {
  BlueprintService,
  RecipeService,
  StackConfigDefaults,
} from "@repo/scaffold";
import { Console, Effect, Option, Schema } from "effect";
import { Command } from "effect/unstable/cli";
import {
  architectureFlag,
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
import {
  applyArchitecture,
  prospectiveConfig,
  requestedArchitecture,
  validateArchitectureRequest,
} from "../lib/targetArchitecture";
import { CONFIG_FILENAME, ConfigureService } from "../service/ConfigureService";
import { ScaffoldPipeline } from "../service/ScaffoldPipeline";
import { WorkspaceTransaction } from "../service/WorkspaceTransaction";

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
    architecture: architectureFlag,
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
      const blueprints = yield* BlueprintService;
      const transaction = yield* WorkspaceTransaction;
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
      const architecture = requestedArchitecture(flags.architecture);
      const requestedTargets = applyArchitecture(
        flags.target.value,
        architecture,
      );
      yield* validateArchitectureRequest(requestedTargets, architecture);

      const existing = yield* configure
        .readConfig(repoRoot)
        .pipe(Effect.option);
      if (Option.isSome(existing)) {
        return yield* Effect.fail(
          `${CONFIG_FILENAME} already exists at ${configure.configPath(repoRoot)}. Create requires a new workspace; use stack-effect add for an existing project.`,
        );
      }

      const recipeSpec = buildRecipeSpec(requestedTargets, !flags.noGit);
      const selection = yield* recipes.resolve(recipeSpec, {
        config,
        providerStrategy: { _tag: "fail-on-ambiguous" },
      });
      const createCommand = recipes.renderCreateCommand({ config, selection });
      const blueprint = yield* blueprints.resolve(selection);
      const nextConfig = prospectiveConfig(config, blueprint);
      const runPipeline = (root: string, dryRun: boolean) =>
        pipeline.run({
          selection,
          repoRoot: root,
          yes: flags.yes,
          dryRun,
          showFiles: flags.showFiles,
          trust: flags.trust || flags.yes,
          config: nextConfig,
          createCommand,
        });

      if (flags.dryRun) yield* runPipeline(repoRoot, true);
      else {
        yield* Console.log(`Create command: ${createCommand}`);
        yield* transaction.run({
          root: repoRoot,
          config: nextConfig,
          execute: (stageRoot) => runPipeline(stageRoot, false),
          validate: () => Effect.void,
        });
        yield* Console.log(`\nWritten ${CONFIG_FILENAME}`);
      }
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
