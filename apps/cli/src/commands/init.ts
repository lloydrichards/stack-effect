import { TargetIdentity } from "@repo/domain/Catalog";
import type { Selection } from "@repo/domain/Selection";
import { Console, Effect, Option, Schema } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli";
import { dryRunFlag, formatFlag, rootFlag, yesFlag } from "../flags";
import {
  CONFIG_FILENAME,
  ConfigureService,
  StackConfig,
} from "../service/ConfigureService";
import { ScaffoldPipeline } from "../service/ScaffoldPipeline";

const buildInitSelection = (
  config: typeof StackConfig.Type,
): typeof Selection.Type => {
  const modules: Array<{ id: "turbo" | "biome" | "vitest" }> = [];

  if (config.monorepo === "turbo") modules.push({ id: "turbo" });
  if (config.lint === "biome" || config.format === "biome")
    modules.push({ id: "biome" });
  if (config.test === "vitest") modules.push({ id: "vitest" });

  return {
    targets: [
      {
        identity: new TargetIdentity({ kind: "init", name: config.name }),
        modules,
      },
    ],
  };
};

const nameArg = Argument.string("project-name").pipe(Argument.optional);

const packageManagerFlag = Flag.choice("package-manager", [
  "bun",
  "pnpm",
  "npm",
]).pipe(Flag.optional, Flag.withDescription("Package manager to use"));

/**
 * Prompt for an optional tool choice, returning Option.none for "none".
 */
const optionalSelect = <A extends string>(
  message: string,
  choices: ReadonlyArray<{ title: string; value: A }>,
) =>
  Effect.gen(function* () {
    const v = yield* Prompt.select({
      message,
      choices: [...choices, { title: "none", value: "none" as A }],
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
    format: formatFlag,
    packageManager: packageManagerFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const configure = yield* ConfigureService;
      const repoRoot = Option.getOrElse(flags.root, () => process.cwd());

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
          : yield* Prompt.confirm({
              message: "Re-initialize? This will overwrite stack.config.json.",
              initial: false,
            });
        if (!reinit) {
          yield* Console.log("Aborted.");
          return;
        }
      }

      // Project name
      const projectName = Option.isSome(flags.name)
        ? flags.name.value
        : flags.yes
          ? "my-stack-app"
          : yield* Prompt.text({
              message: "Project name:",
              validate: (v) =>
                v.trim().length > 0
                  ? Effect.succeed(v.trim())
                  : Effect.fail("Name cannot be empty"),
            });

      // Package manager
      const packageManager = Option.isSome(flags.packageManager)
        ? flags.packageManager.value
        : flags.yes
          ? ("bun" as const)
          : yield* Prompt.select({
              message: "Package manager:",
              choices: [
                { title: "bun", value: "bun" as const },
                { title: "pnpm", value: "pnpm" as const },
                { title: "npm", value: "npm" as const },
              ],
            });

      // Monorepo
      const monorepo = flags.yes
        ? Option.some("turbo" as const)
        : yield* optionalSelect("Monorepo tool:", [
            { title: "turbo", value: "turbo" as const },
          ]);

      // Lint
      const lint = flags.yes
        ? Option.some("biome" as const)
        : yield* optionalSelect("Linter:", [
            { title: "biome", value: "biome" as const },
          ]);

      // Format
      const format_ = flags.yes
        ? Option.some("biome" as const)
        : yield* optionalSelect("Formatter:", [
            { title: "biome", value: "biome" as const },
          ]);

      // Test
      const test = flags.yes
        ? Option.some("vitest" as const)
        : yield* optionalSelect("Test framework:", [
            { title: "vitest", value: "vitest" as const },
          ]);

      const config: typeof StackConfig.Type = {
        name: projectName as typeof Schema.NonEmptyString.Type,
        packageManager,
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
      };

      // Preview
      yield* Console.log("\nProject configuration:");
      yield* Console.log(`  Name: ${config.name}`);
      yield* Console.log(`  Package manager: ${config.packageManager}`);
      yield* Console.log(
        `  Monorepo: ${Option.getOrElse(monorepo, () => "none")}`,
      );
      yield* Console.log(`  Lint: ${Option.getOrElse(lint, () => "none")}`);
      yield* Console.log(
        `  Format: ${Option.getOrElse(format_, () => "none")}`,
      );
      yield* Console.log(`  Test: ${Option.getOrElse(test, () => "none")}`);
      yield* Console.log(`  Config: ${configure.configPath(repoRoot)}`);

      if (!flags.yes) {
        const proceed = yield* Prompt.confirm({
          message: "Create project?",
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
      const format = Option.getOrUndefined(flags.format);

      yield* pipeline.run({
        selection,
        repoRoot,
        format,
        yes: flags.yes,
        dryRun: flags.dryRun,
      });

      yield* Console.log("Run 'stack-effect add' to add targets and modules.");
    }),
);
