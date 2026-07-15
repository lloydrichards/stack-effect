import { CatalogService } from "@repo/catalog";
import {
  ModuleCategory,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { Confirm, MultiSelect, Select, TextInput } from "@repo/tui";
import { Console, Effect, Option, Schema } from "effect";
import { Command } from "effect/unstable/cli";
import { Ansi, Box } from "effect-boxes";
import {
  dryRunFlag,
  noGitFlag,
  projectNameArg,
  rootFlag,
  runtimeFlag,
  trustFlag,
  typescriptFlag,
  yesFlag,
} from "../flags";
import { resolveNameAndRoot } from "../lib/project";
import { toWorkspaceToolValue } from "../lib/workspace";
import {
  CONFIG_FILENAME,
  ConfigureService,
  StackConfig,
} from "../service/ConfigureService";
import { RecipeService } from "../service/RecipeService";
import { ScaffoldPipeline } from "../service/ScaffoldPipeline";

/**
 * Prompt for an optional tool choice, returning Option.none for "none".
 */
const optionalSelect = <A extends string>(
  message: string,
  choices: ReadonlyArray<{ title: string; value: A }>,
) =>
  Effect.gen(function* () {
    const v = yield* Select({
      message,
      choices: [...choices, { title: "< skip >", value: "none" as A }],
    });
    return v === "none" ? Option.none<A>() : Option.some(v);
  });

const workspaceChoices = (
  catalog: typeof CatalogService.Service,
  category: typeof ModuleCategory.Type,
) =>
  catalog.getModules({ category }).map((m) => ({
    title: m.title,
    description: m.description,
    value: toWorkspaceToolValue(m.id),
  }));

const moduleChoices = (
  catalog: typeof CatalogService.Service,
  category: typeof ModuleCategory.Type,
) =>
  catalog.getModules({ category }).map((m) => ({
    title: m.title,
    description: m.description,
    value: m.id,
  }));

const defaultChoice = <A extends string>(
  choices: ReadonlyArray<{ value: A }>,
  fallback: A,
) => choices[0]?.value ?? fallback;

const chooseOptionalTool = <A extends string>(
  yes: boolean,
  message: string,
  choices: ReadonlyArray<{ title: string; value: A }>,
  fallback: A,
) =>
  yes
    ? Effect.succeed(Option.some(defaultChoice(choices, fallback)))
    : optionalSelect(message, choices);

export const init = Command.make(
  "init",
  {
    name: projectNameArg,
    root: rootFlag,
    yes: yesFlag,
    dryRun: dryRunFlag,
    runtime: runtimeFlag,
    typescript: typescriptFlag,
    noGit: noGitFlag,
    trust: trustFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const configure = yield* ConfigureService;
      const catalog = yield* CatalogService;

      const monorepoChoices = workspaceChoices(
        catalog,
        ModuleCategory.make("monorepo"),
      );
      const lintChoices = workspaceChoices(
        catalog,
        ModuleCategory.make("lint"),
      );
      const formatChoices = workspaceChoices(
        catalog,
        ModuleCategory.make("format"),
      );
      const testChoices = workspaceChoices(
        catalog,
        ModuleCategory.make("test"),
      );
      const devenvChoices = moduleChoices(
        catalog,
        ModuleCategory.make("devenv"),
      );

      if (flags.yes && Option.isNone(flags.name)) {
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

      const { projectName, repoRoot } = yield* resolveNameAndRoot(
        nameInput,
        flags.root,
      );

      const existing = yield* configure
        .readConfig(repoRoot)
        .pipe(Effect.option);

      if (Option.isSome(existing)) {
        yield* Console.log(
          `Project '${existing.value.name}' already initialized in ${repoRoot}`,
        );
        const reinit = flags.yes
          ? false
          : yield* Confirm({
              message: "Re-initialize? This will overwrite stack.effect.json.",
              initial: false,
              label: {
                confirm: "Re-initialize",
                deny: "Cancel",
              },
            });
        if (!reinit) {
          yield* Console.log("Aborted.");
          return;
        }
      }

      const runtimeChoice = Option.isSome(flags.runtime)
        ? flags.runtime.value
        : flags.yes
          ? ("bun" as const)
          : yield* Select({
              message: "What runtime will you use?",
              choices: [
                { title: "bun", value: "bun" as const },
                { title: "node", value: "node" as const },
              ],
            });

      const typescript = Option.isSome(flags.typescript)
        ? flags.typescript.value
        : flags.yes
          ? ("6" as const)
          : yield* Select({
              message: "What TypeScript version will you use?",
              choices: [
                { title: "TypeScript 6", value: "6" as const },
                { title: "TypeScript 7", value: "7" as const },
              ],
            });

      let runtime: typeof StackConfig.fields.runtime.Type;
      if (runtimeChoice === "bun") {
        runtime = { _tag: "bun" };
      } else {
        const pm = flags.yes
          ? ("pnpm" as const)
          : yield* Select({
              message: "What package manager will you use?",
              choices: [
                { title: "pnpm", value: "pnpm" as const },
                { title: "npm", value: "npm" as const },
              ],
            });
        runtime = { _tag: "node", packageManager: pm };
      }

      const monorepo = yield* chooseOptionalTool(
        flags.yes,
        "What monorepo tool will you use?",
        monorepoChoices,
        "turbo",
      );
      const lint = yield* chooseOptionalTool(
        flags.yes,
        "What will you use for linting?",
        lintChoices,
        "biome",
      );
      const format_ = yield* chooseOptionalTool(
        flags.yes,
        "What will you use for formatting?",
        formatChoices,
        "biome",
      );
      const test = yield* chooseOptionalTool(
        flags.yes,
        "What test framework will you use?",
        testChoices,
        "vitest",
      );

      const git = flags.noGit
        ? false
        : flags.yes
          ? true
          : yield* Confirm({
              message: "Initialize a git repository?",
              initial: true,
            });

      const dxExtras =
        devenvChoices.length === 0
          ? []
          : flags.yes
            ? devenvChoices.map((c) => c.value)
            : yield* MultiSelect({
                message: "Developer experience extras (optional)",
                choices: devenvChoices.map((c) => ({
                  ...c,
                  selected: false,
                })),
              });

      const config = new StackConfig({
        name: projectName as typeof Schema.NonEmptyString.Type,
        runtime,
        typescript,
        ...Option.match(lint, {
          onNone: () => ({}),
          onSome: (v) => ({ lint: v }),
        }),
        ...Option.match(format_, {
          onNone: () => ({}),
          onSome: (v) => ({ format: v }),
        }),
        ...Option.match(test, {
          onNone: () => ({}),
          onSome: (v) => ({ test: v }),
        }),
        ...Option.match(monorepo, {
          onNone: () => ({}),
          onSome: (v) => ({ monorepo: v }),
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
                  Box.text(repoRoot),
                  Box.text(config.runtimeName),
                  Box.text(config.packageManagerName),
                  Box.text(config.typescriptVersion),
                  Box.text(config.monorepo ?? "none"),
                  Box.text(config.lint ?? "none"),
                  Box.text(config.format ?? "none"),
                  Box.text(config.test ?? "none"),
                  Box.text(git === false ? "no" : "yes"),
                  Box.text(dxExtrasDisplay),
                  Box.text(configure.configPath(repoRoot)),
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

      if (!flags.yes && !flags.dryRun) {
        const proceed = yield* Confirm({
          message: "Create project?",
          children: configBox,
          initial: true,
        });
        if (!proceed) {
          yield* Console.log("Aborted.");
          return;
        }
      }

      if (!flags.dryRun) {
        yield* configure.writeConfig(repoRoot, config);
        yield* Console.log(`\nWritten ${CONFIG_FILENAME}`);
      }

      const pipeline = yield* ScaffoldPipeline;
      const recipe = yield* RecipeService;
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
        {
          config,
          providerStrategy: { _tag: "fail-on-ambiguous" },
        },
      );

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
      command: "stack-effect init my-app --yes --package-manager bun --no-git",
      description: "Non-interactive with explicit options",
    },
  ]),
);
