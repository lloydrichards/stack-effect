import {
  ModuleId,
  TargetIdentity,
  TargetKind,
  type CatalogSources,
  selectsOfficialCatalog,
} from "@repo/domain/Catalog";
import {
  RecipeResolveOptions,
  RecipeSpec,
  type RecipeTargetSpec,
} from "@repo/domain/Recipe";
import {
  defaultsForRuntime,
  type Runtime,
  STACK_CONFIG_SCHEMA_URL,
  StackConfig,
  StackConfigDefaults,
  type TypeScriptVersion,
} from "@repo/domain/StackConfig";
import { BlueprintResolver } from "@repo/scaffold/Blueprint";
import { RecipeResolver } from "@repo/scaffold/Recipe";
import { Array as Arr, Console, Effect, Option } from "effect";
import { Command } from "effect/cli";
import {
  catalogFlag,
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
  runtimeFromFlags,
  showFilesFlag,
  testFlag,
  trustFlag,
  typescriptFlag,
  yesFlag,
} from "../flags";
import { resolveNameAndRoot } from "../lib/project";
import { decodeRunFlags } from "../lib/runMode";
import { CatalogSelection } from "../service/CatalogSelection";
import { CONFIG_FILENAME, ConfigureService } from "../service/ConfigureService";
import { ScaffoldPipeline } from "../service/ScaffoldPipeline";

const buildConfig = (
  projectName: string,
  runtime: Runtime,
  tools: {
    typescript: Option.Option<TypeScriptVersion>;
    monorepo: Option.Option<string>;
    lint: Option.Option<string>;
    format: Option.Option<string>;
    test: Option.Option<string>;
    catalogs: Option.Option<CatalogSources>;
  },
  defaults: StackConfig,
): StackConfig => {
  const runtimeDefaults = defaultsForRuntime(defaults, runtime._tag);

  return new StackConfig({
    $schema: STACK_CONFIG_SCHEMA_URL,
    name: projectName,
    runtime,
    typescript: Option.getOrElse(
      tools.typescript,
      () => runtimeDefaults.typescript,
    ),
    monorepo: Option.getOrElse(tools.monorepo, () => runtimeDefaults.monorepo),
    lint: Option.getOrElse(tools.lint, () => runtimeDefaults.lint),
    format: Option.getOrElse(tools.format, () => runtimeDefaults.format),
    test: Option.getOrElse(tools.test, () => runtimeDefaults.test),
    ...Option.match(tools.catalogs, {
      onNone: () => ({}),
      onSome: (sources) => ({ catalogs: sources }),
    }),
  });
};

const buildRecipeSpec = (
  targets: ReadonlyArray<RecipeTargetSpec>,
  includeGit: boolean,
): RecipeSpec =>
  RecipeSpec.make({
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
    catalog: catalogFlag,
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
      const { mode } = yield* decodeRunFlags(flags);
      const configure = yield* ConfigureService;
      const pipeline = yield* ScaffoldPipeline;
      const recipes = yield* RecipeResolver;
      const defaults = yield* StackConfigDefaults;
      const catalogSelection = yield* CatalogSelection;

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

      const runtime = yield* runtimeFromFlags(
        flags.runtime,
        flags.packageManager,
        defaults.runtime,
      );
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

      const { projectName, repositoryRoot } = yield* resolveNameAndRoot(
        flags.name.value,
        flags.root,
      );
      const config = buildConfig(
        projectName,
        runtime,
        { ...flags, catalogs: catalogSelection.explicit },
        defaults,
      );
      // workspace-devenv-git is an official module; custom-only sets bring their own.
      const recipeSpec = buildRecipeSpec(
        flags.target.value,
        !flags.noGit && selectsOfficialCatalog(catalogSelection.sources),
      );
      const selection = yield* recipes.resolve(
        recipeSpec,
        RecipeResolveOptions.make({
          config,
          providerStrategy: { _tag: "fail-on-ambiguous" },
        }),
      );
      const blueprints = yield* BlueprintResolver;
      const blueprint = yield* blueprints.resolve(selection, config);
      const createCommand = recipes.renderCreateCommand({ config, selection });

      const existing = yield* configure.readConfig(repositoryRoot).pipe(
        Effect.asSome,
        Effect.catchTag("MissingConfigError", () => Effect.succeedNone),
      );

      if (Option.isSome(existing)) {
        return yield* Effect.fail(
          `${CONFIG_FILENAME} already exists at ${configure.configPath(
            repositoryRoot,
          )}. This looks like an existing stack-effect project; use 'stack-effect init' and 'stack-effect add' for existing or incremental workflows.`,
        );
      }

      if (mode._tag === "write") {
        yield* Console.log(`Create command: ${createCommand}`);
        yield* configure.writeConfig(repositoryRoot, config);
        yield* Console.log(`\nWritten ${CONFIG_FILENAME}`);
      }

      yield* pipeline.run(
        { selection, blueprint, repositoryRoot, config, createCommand },
        mode,
      );
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
