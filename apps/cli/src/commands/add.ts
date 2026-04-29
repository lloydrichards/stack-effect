import { TargetIdentity } from "@repo/domain/Scaffold";
import { Effect, Option } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";
import { dryRunFlag, formatFlag, rootFlag, yesFlag } from "../flags";
import { ConfigureService } from "../service/ConfigureService";
import { ScaffoldPipeline } from "../service/ScaffoldPipeline";

export const add = Command.make(
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
