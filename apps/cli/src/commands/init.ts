import { CatalogReader } from "@repo/catalog/Catalog";
import {
  ModuleCategory,
  ModuleId,
  TargetIdentity,
  TargetKind,
  selectsOfficialCatalog,
} from "@repo/domain/Catalog";
import { RecipeResolveOptions } from "@repo/domain/Recipe";
import {
  defaultsForRuntime,
  Runtime,
  STACK_CONFIG_SCHEMA_URL,
  StackConfigDefaults,
  toWorkspaceToolValue,
} from "@repo/domain/StackConfig";
import { BlueprintResolver } from "@repo/scaffold/Blueprint";
import { RecipeResolver } from "@repo/scaffold/Recipe";
import { Confirm, MultiSelect, Select, TextInput } from "@repo/tui";
import { Console, Effect, Option } from "effect";
import { Ansi, Box } from "effect-boxes";
import { Command } from "effect/cli";
import {
  catalogFlag,
  dryRunFlag,
  noGitFlag,
  projectNameArg,
  rootFlag,
  RUNTIME_BY_PACKAGE_MANAGER,
  runtimeFlag,
  showFilesFlag,
  trustFlag,
  typescriptFlag,
  yesFlag,
} from "../flags";
import { resolveNameAndRoot } from "../lib/project";
import { askOr, type Confirmation, decodeRunFlags } from "../lib/runMode";
import { CatalogSelection } from "../service/CatalogSelection";
import {
  CONFIG_FILENAME,
  ConfigureService,
  StackConfig,
} from "../service/ConfigureService";
import { ScaffoldPipeline } from "../service/ScaffoldPipeline";

const optionalSelect = <A extends string>(
  message: string,
  choices: ReadonlyArray<{ title: string; value: A }>,
) =>
  Effect.map(
    Select({
      message,
      choices: [...choices, { title: "< skip >", value: "none" as A }],
    }),
    (value) => (value === "none" ? Option.none<A>() : Option.some(value)),
  );

const workspaceChoices = (
  catalog: typeof CatalogReader.Service,
  category: ModuleCategory,
) =>
  catalog.getModules({ category }).map((m) => ({
    title: m.title,
    description: m.description,
    value: toWorkspaceToolValue(m.id),
  }));

const moduleChoices = (
  catalog: typeof CatalogReader.Service,
  category: ModuleCategory,
) =>
  catalog.getModules({ category }).map((m) => ({
    title: m.title,
    description: m.description,
    value: m.id,
  }));

const chooseTool = Effect.fnUntraced(function* (
  confirm: Confirmation,
  category: string,
  message: string,
  fallback: string | undefined,
) {
  const catalog = yield* CatalogReader;
  const choice = yield* askOr(
    confirm,
    optionalSelect(
      message,
      workspaceChoices(catalog, ModuleCategory.make(category)),
    ),
    Option.fromUndefinedOr(fallback),
  );
  return Option.getOrUndefined(choice);
});

export const init = Command.make(
  "init",
  {
    name: projectNameArg,
    root: rootFlag,
    catalog: catalogFlag,
    yes: yesFlag,
    dryRun: dryRunFlag,
    showFiles: showFilesFlag,
    runtime: runtimeFlag,
    typescript: typescriptFlag,
    noGit: noGitFlag,
    trust: trustFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const { confirm, mode } = yield* decodeRunFlags(flags);
      const configure = yield* ConfigureService;
      const catalog = yield* CatalogReader;
      const defaults = yield* StackConfigDefaults;
      const catalogSelection = yield* CatalogSelection;

      const devenvChoices = moduleChoices(
        catalog,
        ModuleCategory.make("devenv"),
      );

      if (confirm === "assume-yes" && Option.isNone(flags.name)) {
        return yield* Effect.fail(
          "When using --yes with init, provide a project name as the positional argument.",
        );
      }

      const nameInput = Option.isSome(flags.name)
        ? flags.name.value
        : yield* TextInput({
            message: "What is your project name?",
            validate: (v) =>
              v.trim().length > 0
                ? Effect.succeed(v.trim())
                : Effect.fail("Name cannot be empty"),
          });

      const { projectName, repositoryRoot } = yield* resolveNameAndRoot(
        nameInput,
        flags.root,
      );

      const existing = yield* configure.readConfig(repositoryRoot).pipe(
        Effect.asSome,
        Effect.catchTag("MissingConfigError", () => Effect.succeedNone),
      );

      if (Option.isSome(existing)) {
        yield* Console.log(
          `Project '${existing.value.name}' already initialized in ${repositoryRoot}`,
        );
        const reinit = yield* askOr(
          confirm,
          Confirm({
            message: "Re-initialize? This will overwrite stack.effect.json.",
            initial: false,
            label: {
              confirm: "Re-initialize",
              deny: "Cancel",
            },
          }),
          false,
        );
        if (!reinit) {
          yield* Console.log("Aborted.");
          return;
        }
      }

      const runtimeChoice = Option.isSome(flags.runtime)
        ? flags.runtime.value
        : yield* askOr(
            confirm,
            Select<Runtime["_tag"]>({
              message: "What runtime will you use?",
              choices: [
                { title: "bun", value: "bun" },
                { title: "deno", value: "deno" },
                { title: "node", value: "node" },
              ],
            }),
            "bun",
          );
      const runtimeDefaults = defaultsForRuntime(defaults, runtimeChoice);

      const typescript = Option.isSome(flags.typescript)
        ? flags.typescript.value
        : yield* askOr(
            confirm,
            Select<"6" | "7">({
              message: "What TypeScript version will you use?",
              choices: [
                { title: "TypeScript 6", value: "6" },
                { title: "TypeScript 7", value: "7" },
              ],
            }),
            runtimeDefaults.typescript,
          );

      const runtime =
        runtimeChoice === "node"
          ? Runtime.cases.node.make({
              packageManager: yield* askOr(
                confirm,
                Select<"pnpm" | "npm">({
                  message: "What package manager will you use?",
                  choices: [
                    { title: "pnpm", value: "pnpm" },
                    { title: "npm", value: "npm" },
                  ],
                }),
                "pnpm",
              ),
            })
          : RUNTIME_BY_PACKAGE_MANAGER[runtimeChoice];

      const monorepo = yield* chooseTool(
        confirm,
        "monorepo",
        "What monorepo tool will you use?",
        runtimeDefaults.monorepo,
      );
      const lint = yield* chooseTool(
        confirm,
        "lint",
        "What will you use for linting?",
        runtimeDefaults.lint,
      );
      const format = yield* chooseTool(
        confirm,
        "format",
        "What will you use for formatting?",
        runtimeDefaults.format,
      );
      const test = yield* chooseTool(
        confirm,
        "test",
        "What test framework will you use?",
        runtimeDefaults.test,
      );

      // workspace-devenv-git is an official module; custom-only sets bring their own.
      const git =
        flags.noGit || !selectsOfficialCatalog(catalogSelection.sources)
          ? false
          : yield* askOr(
              confirm,
              Confirm({
                message: "Initialize a git repository?",
                initial: true,
              }),
              true,
            );

      const dxExtras =
        devenvChoices.length === 0
          ? []
          : yield* askOr(
              confirm,
              MultiSelect({
                message: "Developer experience extras (optional)",
                choices: devenvChoices
                  .filter(
                    (choice) =>
                      git || choice.value !== "workspace-devenv-husky",
                  )
                  .map((choice) => ({ ...choice, selected: false })),
              }),
              [],
            );

      const config = new StackConfig({
        $schema: STACK_CONFIG_SCHEMA_URL,
        name: projectName,
        runtime,
        typescript,
        lint,
        format,
        test,
        monorepo,
        ...Option.match(catalogSelection.explicit, {
          onNone: () => ({}),
          onSome: (sources) => ({ catalogs: sources }),
        }),
      });

      const dxExtrasDisplay =
        dxExtras.length === 0 ? "none" : dxExtras.join(", ");
      const configBox = Box.vsep(
        [
          Box.text("Project Configuration").pipe(
            Box.annotate(Ansi.combine(Ansi.bold, Ansi.cyan)),
          ),
          Box.hsep(
            [
              Box.vcat(
                [
                  Box.text("Name:"),
                  Box.text("Directory:"),
                  Box.text("Runtime:"),
                  Box.text("Package manager:"),
                  Box.text("TypeScript:"),
                  Box.text("Monorepo:"),
                  Box.text("Lint:"),
                  Box.text("Format:"),
                  Box.text("Test:"),
                  Box.text("Git:"),
                  Box.text("DX Extras:"),
                  Box.text("Config:"),
                ],
                Box.left,
              ),
              Box.vcat(
                [
                  Box.text(config.name),
                  Box.text(repositoryRoot),
                  Box.text(config.runtimeName),
                  Box.text(config.packageManagerName),
                  Box.text(config.typescriptVersion),
                  Box.text(config.monorepo ?? "none"),
                  Box.text(config.lint ?? "none"),
                  Box.text(config.format ?? "none"),
                  Box.text(config.test ?? "none"),
                  Box.text(git === false ? "no" : "yes"),
                  Box.text(dxExtrasDisplay),
                  Box.text(configure.configPath(repositoryRoot)),
                ],
                Box.left,
              ),
            ],
            1,
            Box.left,
          ).pipe(Box.moveRight(1)),
        ],
        1,
        Box.left,
      );

      if (mode._tag === "write") {
        const proceed = yield* askOr(
          confirm,
          Confirm({
            message: "Create project?",
            children: configBox,
            initial: true,
          }),
          true,
        );
        if (!proceed) {
          yield* Console.log("Aborted.");
          return;
        }
      }

      const pipeline = yield* ScaffoldPipeline;
      const recipe = yield* RecipeResolver;
      const explicitWorkspaceModules = [
        ...(git ? [ModuleId.make("workspace-devenv-git")] : []),
        ...dxExtras.map((moduleId) => ModuleId.make(moduleId)),
      ];
      const selection = yield* recipe.resolve(
        {
          targets:
            explicitWorkspaceModules.length === 0
              ? []
              : [
                  {
                    target: new TargetIdentity({
                      kind: TargetKind.make("workspace"),
                      name: config.name,
                    }),
                    modules: explicitWorkspaceModules,
                  },
                ],
        },
        RecipeResolveOptions.make({
          config,
          providerStrategy: { _tag: "fail-on-ambiguous" },
        }),
      );

      const blueprints = yield* BlueprintResolver;
      yield* blueprints.resolve(selection, config);

      if (mode._tag === "write") {
        yield* configure.writeConfig(repositoryRoot, config);
        yield* Console.log(`\nWritten ${CONFIG_FILENAME}`);
      }

      yield* pipeline.run({ selection, repositoryRoot, config }, mode);
    }),
).pipe(
  Command.withDescription(
    "Scaffold a new Effect project in a subdirectory (or '.' for the current directory). Runs interactively unless --yes is passed.",
  ),
  Command.withShortDescription("Create a new project"),
  Command.withExamples([
    {
      command: "stack-effect init my-app",
      description: "Create a new project in ./my-app interactively",
    },
    {
      command: "stack-effect init . --yes",
      description: "Initialize in the current directory using the folder name",
    },
    {
      command: "stack-effect init my-app --yes --runtime bun --no-git",
      description: "Non-interactive with explicit options",
    },
  ]),
);
