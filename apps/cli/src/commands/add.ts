import { ModuleCatalog } from "@repo/catalog";
import type { ModuleId, TargetKind } from "@repo/domain/Catalog";
import { TargetIdentity } from "@repo/domain/Catalog";
import type { Selection } from "@repo/domain/Selection";
import { Effect, Option, Ref, Schedule } from "effect";
import { Command, Prompt } from "effect/unstable/cli";
import { dryRunFlag, formatFlag, rootFlag, yesFlag } from "../flags";
import { ConfigureService } from "../service/ConfigureService";
import { ScaffoldAborted, ScaffoldPipeline } from "../service/ScaffoldPipeline";

interface CollectedTarget {
  kind: Exclude<typeof TargetKind.Type, "init">;
  name: string;
  modules: ReadonlyArray<typeof ModuleId.Type>;
}

const collectTargetsInteractive = Effect.gen(function* () {
  const catalog = yield* ModuleCatalog;
  const targetModuleMap = yield* catalog.targetModuleMap;

  const targets = yield* Ref.make<Array<CollectedTarget>>([]);
  let loop = true;

  while (loop) {
    // 1. Select target kind
    const kind = yield* Prompt.select({
      message: "What kind of target do you want to add?",
      choices: Array.from(targetModuleMap.entries()).map(
        ([value, { title }]) => ({ title, value }),
      ),
    });

    // 2. Name the target
    const name = yield* Prompt.text({
      message: `What should this ${kind} target be called?`,
    });

    // 3. Select modules for this target
    const targetEntry = targetModuleMap.get(kind);
    const availableModules = targetEntry?.modules ?? [];
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
  },
  (flags) =>
    Effect.gen(function* () {
      const configure = yield* ConfigureService;
      const pipeline = yield* ScaffoldPipeline;

      const repoRoot = Option.getOrElse(flags.root, () => process.cwd());
      const format = Option.getOrUndefined(flags.format);

      // Require init
      yield* configure.requireConfig(repoRoot);

      // Collect targets: use flags if provided, otherwise interactive loop
      const collected = yield* collectTargetsInteractive;

      // Build selection
      const selection: typeof Selection.Type = {
        targets: collected.map((t) => ({
          identity: new TargetIdentity({ kind: t.kind, name: t.name }),
          modules: t.modules.map((id) => ({ id })),
        })),
      };

      yield* pipeline.run({
        selection,
        repoRoot,
        format,
        yes: flags.yes,
        dryRun: flags.dryRun,
      });
    }).pipe(
      Effect.retry({
        while: (err) => err._tag === "ScaffoldAborted" && err.retry === true,
        schedule: Schedule.forever,
      }),
      Effect.catchTag("ScaffoldAborted", (err) => {
        if (err.retry) {
          return Effect.log(err.message);
        } else {
          return Effect.succeed(err.message);
        }
      }),
    ),
);
