import { ModuleCatalog } from "@repo/catalog";
import type { ModuleId, TargetKind } from "@repo/domain/Scaffold";
import { TargetIdentity } from "@repo/domain/Scaffold";
import { Effect, Option, Ref } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";
import { dryRunFlag, formatFlag, rootFlag, yesFlag } from "../flags";
import { ConfigureService } from "../service/ConfigureService";
import { ScaffoldPipeline } from "../service/ScaffoldPipeline";

interface CollectedTarget {
  kind: Exclude<typeof TargetKind.Type, "init">;
  name: string;
  modules: ReadonlyArray<typeof ModuleId.Type>;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const collectTargetsInteractive = Effect.gen(function* () {
  const catalog = yield* ModuleCatalog;
  const targetModuleMap = catalog.getTargetModuleMap();

  const targets = yield* Ref.make<Array<CollectedTarget>>([]);
  let loop = true;

  while (loop) {
    // 1. Select target kind
    const kind = yield* Prompt.select({
      message: "What kind of target do you want to add?",
      choices: Array.from(targetModuleMap.keys()).map((kind) => ({
        title: capitalize(kind),
        value: kind,
      })),
    });

    // 2. Name the target
    const name = yield* Prompt.text({
      message: `What should this ${kind} target be called?`,
      default: "",
    });

    // 3. Select modules for this target
    const availableModules = targetModuleMap.get(kind) ?? [];
    const modules =
      availableModules.length > 0
        ? yield* Prompt.multiSelect({
            message: `Which modules do you want to add to "${kind}-${name}"?`,
            choices: availableModules.map((mod) => ({
              title: mod.title,
              value: mod.id,
              description: mod.description,
            })),
          })
        : [];

    yield* Ref.update(targets, (ts) => [...ts, { kind, name, modules }]);

    // 4. Add another or continue?
    const next = yield* Prompt.select({
      message: "What would you like to do next?",
      choices: [
        { title: "Continue", value: "continue" as const },
        { title: "Add another target", value: "add" as const },
      ],
    });

    if (next === "continue") {
      loop = false;
    }
  }

  return yield* Ref.get(targets);
});

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

      const httpApiStyle =
        flags.httpApiStyle._tag === "Some"
          ? flags.httpApiStyle.value
          : undefined;

      // Collect targets: use flags if provided, otherwise interactive loop
      const collected: ReadonlyArray<CollectedTarget> =
        flags.target.length > 0
          ? flags.target.map((kind) => ({
              kind,
              name: kind,
              modules: flags.module.filter((m) => {
                if (m === "domain-api") return kind === "package";
                if (m === "http-api-server") return kind === "server";
                return false;
              }),
            }))
          : yield* collectTargetsInteractive;

      // Build selection
      const selection = {
        targets: collected.map((t) => ({
          identity: new TargetIdentity({ kind: t.kind, name: t.name }),
          modules: t.modules.map((id) => ({ id })),
          options: {
            ...(t.kind === "server" && httpApiStyle ? { httpApiStyle } : {}),
            ...(t.kind === "package" && t.modules.includes("domain-api")
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
