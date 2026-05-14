import { CatalogService } from "@repo/catalog";
import {
  ModuleCategory,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import type { Selection } from "@repo/domain/Selection";
import { Array as Arr, Console, Effect, Option, Path, Schema } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { Ansi, Box } from "effect-boxes";
import { Confirm } from "../components/Confirm";
import { Select } from "../components/Select";
import { TextInput } from "../components/TextInput";
import { dryRunFlag, noGitFlag, rootFlag, yesFlag } from "../flags";
import {
  CONFIG_FILENAME,
  ConfigureService,
  StackConfig,
} from "../service/ConfigureService";
import { ScaffoldPipeline } from "../service/ScaffoldPipeline";

const buildInitSelection = (
  config: typeof StackConfig.Type,
): typeof Selection.Type => {
  // Collect unique module IDs from all category fields
  const moduleIds = new Set<string>();
  for (const field of [
    config.monorepo,
    config.lint,
    config.format,
    config.test,
  ]) {
    if (field !== undefined) moduleIds.add(field);
  }

  if (config.git !== false) {
    moduleIds.add("git-init");
  }

  return {
    targets: [
      {
        identity: new TargetIdentity({
          kind: TargetKind.make("init"),
          name: config.name,
        }),
        modules: Arr.fromIterable(moduleIds).map((id) => ({
          id: ModuleId.make(id),
        })),
      },
    ],
  };
};

const nameArg = Argument.string("project-name").pipe(Argument.optional);

const runtimeFlag = Flag.choice("runtime", ["bun", "node"]).pipe(
  Flag.optional,
  Flag.withDescription("Runtime to use"),
);

/**
 * Resolve project name and output directory from the positional name argument
 * and the `--root` flag, matching the convention used by create-t3-app and
 * create-better-t-stack:
 *
 * - `stack-effect init my-app`       → dir=cwd/my-app, name="my-app"
 * - `stack-effect init .`            → dir=cwd,        name=basename(cwd)
 * - `stack-effect init my-app -r /d` → dir=/d/my-app,  name="my-app"
 * - `stack-effect init . -r /d`      → dir=/d,         name=basename(/d)
 */
const resolveNameAndRoot = Effect.fn("resolveNameAndRoot")(function* (
  nameInput: string,
  rootFlag: Option.Option<string>,
) {
  const path = yield* Path.Path;
  const base = Option.getOrElse(rootFlag, () => process.cwd());
  if (nameInput === ".") {
    const resolved = path.resolve(base);
    return { projectName: path.basename(resolved), repoRoot: resolved };
  }
  const repoRoot = path.resolve(base, nameInput);
  return { projectName: nameInput, repoRoot };
});

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

export const init = Command.make(
  "init",
  {
    name: nameArg,
    root: rootFlag,
    yes: yesFlag,
    dryRun: dryRunFlag,
    packageManager: runtimeFlag,
    noGit: noGitFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const configure = yield* ConfigureService;
      const catalog = yield* CatalogService;

      // Build choices from catalog for each init category
      const monorepoChoices = catalog
        .getModules({ category: ModuleCategory.make("monorepo") })
        .map((m) => ({
          title: m.title,
          description: m.description,
          value: m.id,
        }));
      const lintChoices = catalog
        .getModules({ category: ModuleCategory.make("lint") })
        .map((m) => ({
          title: m.title,
          description: m.description,
          value: m.id,
        }));
      const formatChoices = catalog
        .getModules({ category: ModuleCategory.make("format") })
        .map((m) => ({
          title: m.title,
          description: m.description,
          value: m.id,
        }));
      const testChoices = catalog
        .getModules({ category: ModuleCategory.make("test") })
        .map((m) => ({
          title: m.title,
          description: m.description,
          value: m.id,
        }));

      // Project name and output directory
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

      // Check if already initialized
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

      // Runtime
      const runtimeChoice = Option.isSome(flags.packageManager)
        ? flags.packageManager.value
        : flags.yes
          ? ("bun" as const)
          : yield* Select({
              message: "What runtime will you use?",
              choices: [
                { title: "bun", value: "bun" as const },
                { title: "node", value: "node" as const },
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

      // Monorepo
      const monorepo = flags.yes
        ? Option.some(monorepoChoices[0]?.value ?? "turbo")
        : yield* optionalSelect(
            "What monorepo tool will you use?",
            monorepoChoices,
          );

      // Lint
      const lint = flags.yes
        ? Option.some(lintChoices[0]?.value ?? "biome")
        : yield* optionalSelect("What will you use for linting?", lintChoices);

      // Format
      const format_ = flags.yes
        ? Option.some(formatChoices[0]?.value ?? "biome")
        : yield* optionalSelect(
            "What will you use for formatting?",
            formatChoices,
          );

      // Test
      const test = flags.yes
        ? Option.some(testChoices[0]?.value ?? "vitest")
        : yield* optionalSelect(
            "What test framework will you use?",
            testChoices,
          );

      // Git
      const git = flags.noGit
        ? false
        : flags.yes
          ? true
          : yield* Confirm({
              message: "Initialize a git repository?",
              initial: true,
            });

      const config = new StackConfig({
        name: projectName as typeof Schema.NonEmptyString.Type,
        runtime,
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
        git,
      });

      // Preview
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
                  Box.text("Monorepo:"),
                  Box.text("Lint:"),
                  Box.text("Format:"),
                  Box.text("Test:"),
                  Box.text("Git:"),
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
                  Box.text(config.monorepo ?? "none"),
                  Box.text(config.lint ?? "none"),
                  Box.text(config.format ?? "none"),
                  Box.text(config.test ?? "none"),
                  Box.text(config.git === false ? "no" : "yes"),
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

      if (!flags.yes) {
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
      } else {
        yield* Console.log("[dry-run] skipping config write:");
        yield* Console.log(
          Schema.encodeSync(Schema.fromJsonString(StackConfig))(config),
        );
      }

      // Scaffold root monorepo files
      const pipeline = yield* ScaffoldPipeline;
      const selection = buildInitSelection(config);

      yield* pipeline.run({
        selection,
        repoRoot,
        yes: flags.yes,
        dryRun: flags.dryRun,
        config,
      });

      yield* Console.log("Run 'stack-effect add' to add targets and modules.");
    }),
);
