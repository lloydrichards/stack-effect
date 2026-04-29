import { BunRuntime, BunServices } from "@effect/platform-bun";
import { TargetIdentity } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import {
  ApplyService,
  BlueprintService,
  PlanService,
  ScaffoldFormatter,
} from "@repo/scaffold";
import { Console, Effect, Layer, Option, Schema } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli";
import { dryRunFlag, formatFlag, rootFlag, yesFlag } from "./flags";
import {
  CONFIG_FILENAME,
  ConfigureService,
  StackConfig,
} from "./service/ConfigureService";
import { ScaffoldPipeline } from "./service/ScaffoldPipeline";

// ---------------------------------------------------------------------------
// init — one-time project setup
// ---------------------------------------------------------------------------

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
        options: {},
      },
    ],
  };
};

const init = Command.make(
  "init",
  {
    name: Argument.string("project-name").pipe(Argument.optional),
    root: rootFlag,
    yes: yesFlag,
    dryRun: dryRunFlag,
    format: formatFlag,
    packageManager: Flag.choice("package-manager", ["bun", "pnpm", "npm"]).pipe(
      Flag.optional,
      Flag.withDescription("Package manager to use"),
    ),
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
      const projectName =
        flags.name._tag === "Some"
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
      const packageManager =
        flags.packageManager._tag === "Some"
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

      const config: typeof StackConfig.Type = {
        name: projectName as typeof Schema.NonEmptyString.Type,
        packageManager: packageManager,
        lint: "biome",
        format: "biome",
        test: "vitest",
        monorepo: "turbo",
      };

      // Preview
      yield* Console.log("\nProject configuration:");
      yield* Console.log(`  Name: ${config.name}`);
      yield* Console.log(`  Package manager: ${config.packageManager}`);
      yield* Console.log(`  Monorepo: ${config.monorepo}`);
      yield* Console.log(`  Lint: ${config.lint}`);
      yield* Console.log(`  Format: ${config.format}`);
      yield* Console.log(`  Test: ${config.test}`);
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
      const format =
        flags.format._tag === "Some" ? flags.format.value : undefined;

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

// ---------------------------------------------------------------------------
// add — add targets + modules to an initialized project
// ---------------------------------------------------------------------------
const add = Command.make(
  "add",
  {
    root: rootFlag,
    format: formatFlag,
    yes: yesFlag,
    dryRun: dryRunFlag,
    target: Flag.choice("target", ["client", "server", "cli", "package"]).pipe(
      Flag.atLeast(0),
      Flag.withAlias("t"),
      Flag.withDescription("Target kind(s) to scaffold (repeatable)"),
    ),
    module: Flag.choice("module", ["domain-api", "http-api-server"]).pipe(
      Flag.atLeast(0),
      Flag.withAlias("m"),
      Flag.withDescription("Module(s) to attach (repeatable)"),
    ),
    httpApiStyle: Flag.choice("http-api-style", ["rest"]).pipe(
      Flag.optional,
      Flag.withDescription("HTTP API style (when http-api-server is selected)"),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const configure = yield* ConfigureService;
      const pipeline = yield* ScaffoldPipeline;
      const repoRoot = Option.getOrElse(flags.root, () => process.cwd());

      // Require init
      yield* configure.requireConfig(repoRoot);

      // Resolve targets
      const targets =
        flags.target.length > 0
          ? flags.target
          : yield* Prompt.multiSelect({
              message: "Which targets do you want to add?",
              choices: [
                {
                  title: "Server",
                  value: "server" as const,
                  description: "Effect HTTP server",
                },
                {
                  title: "Client",
                  value: "client" as const,
                  description: "React + Vite client",
                },
                {
                  title: "CLI",
                  value: "cli" as const,
                  description: "Effect CLI app",
                },
                {
                  title: "Package",
                  value: "package" as const,
                  description: "Shared library package",
                },
              ],
              min: 1,
            });

      // Resolve modules
      const availableModules: Array<{
        title: string;
        value: "domain-api" | "http-api-server";
        description: string;
      }> = [];
      if (targets.includes("package")) {
        availableModules.push({
          title: "Domain API",
          value: "domain-api",
          description: "Shared domain schemas + RPC",
        });
      }
      if (targets.includes("server")) {
        availableModules.push({
          title: "HTTP API Server",
          value: "http-api-server",
          description: "REST API endpoints",
        });
      }

      const modules =
        flags.module.length > 0
          ? flags.module
          : availableModules.length > 0
            ? yield* Prompt.multiSelect({
                message: "Which modules do you want to include?",
                choices: availableModules,
              })
            : [];

      const httpApiStyle =
        flags.httpApiStyle._tag === "Some"
          ? flags.httpApiStyle.value
          : undefined;

      // Build selection
      const selection = {
        targets: targets.map((kind) => ({
          identity: new TargetIdentity({ kind, name: kind }),
          modules: (modules as ReadonlyArray<"domain-api" | "http-api-server">)
            .filter((m) => {
              if (m === "domain-api") return kind === "package";
              if (m === "http-api-server") return kind === "server";
              return false;
            })
            .map((id) => ({ id })),
          options: {
            ...(kind === "server" && httpApiStyle ? { httpApiStyle } : {}),
            ...(kind === "package" &&
            (modules as ReadonlyArray<string>).includes("domain-api")
              ? { domainApiSurface: "api" as const }
              : {}),
          },
        })),
      };

      const format =
        flags.format._tag === "Some" ? flags.format.value : undefined;

      yield* pipeline.run({
        selection,
        repoRoot,
        format,
        yes: flags.yes,
        dryRun: flags.dryRun,
      });
    }),
);

// ---------------------------------------------------------------------------
// Root command & entry point
// ---------------------------------------------------------------------------
const root = Command.make("stack-effect");

const MainLayer = Layer.mergeAll(
  ApplyService.layer,
  BlueprintService.layer,
  PlanService.layer,
  ScaffoldFormatter.layer,
  ConfigureService.layer,
  ScaffoldPipeline.layer,
).pipe(Layer.provideMerge(BunServices.layer));

const program = root.pipe(
  Command.withSubcommands([init, add]),
  Command.run({ version: "1.0.0" }),
  Effect.provide(MainLayer),
);

BunRuntime.runMain(program);
