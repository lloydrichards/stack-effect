import { ModuleCatalog } from "@repo/catalog";
import type { ModuleId, TargetKind } from "@repo/domain/Catalog";
import { TargetIdentity } from "@repo/domain/Catalog";
import type { Selection } from "@repo/domain/Selection";
import { Effect, Option, Ref, Schedule } from "effect";
import { Command, Prompt } from "effect/unstable/cli";
import { dryRunFlag, rootFlag, yesFlag } from "../flags";
import { ConfigureService } from "../service/ConfigureService";
import { ScaffoldPipeline } from "../service/ScaffoldPipeline";

interface CollectedTarget {
  kind: Exclude<typeof TargetKind.Type, "init">;
  name: string;
  modules: Array<typeof ModuleId.Type>;
  confirmed: boolean;
}

const formatTargetSummary = (targets: ReadonlyArray<CollectedTarget>): string =>
  targets
    .map((t) => {
      const status = t.confirmed ? "\u2713" : "\u25CB";
      const modules =
        t.modules.length > 0 ? t.modules.join(", ") : "(no modules)";
      return `  ${status} ${t.kind}/${t.name}  [${modules}]`;
    })
    .join("\n");

/**
 * Resolve module implications: when a module implies another module on a
 * different target kind, ensure that target+module exists in the collection.
 * Returns true if any new implications were added.
 */
const resolveImplications = (targets: Array<CollectedTarget>) =>
  Effect.gen(function* () {
    const catalog = yield* ModuleCatalog;
    let changed = false;

    for (const target of targets) {
      for (const moduleId of target.modules) {
        const definition = yield* catalog.get(moduleId);
        for (const implication of definition.implies ?? []) {
          const candidates = targets.filter(
            (t) => t.kind === implication.targetKind,
          );

          if (candidates.length === 0) {
            const name = yield* Prompt.text({
              message: `Module "${definition.title}" requires a ${implication.targetKind} target. What should it be called?`,
            });
            targets.push({
              kind: implication.targetKind as Exclude<
                typeof TargetKind.Type,
                "init"
              >,
              name,
              modules: [implication.moduleId],
              confirmed: false,
            });
            changed = true;
          } else if (candidates.length === 1) {
            const candidate = candidates[0];
            if (
              candidate &&
              !candidate.modules.includes(implication.moduleId)
            ) {
              candidate.modules.push(implication.moduleId);
              candidate.confirmed = false;
              changed = true;
            }
          } else {
            const alreadyPresent = candidates.some((c) =>
              c.modules.includes(implication.moduleId),
            );
            if (!alreadyPresent) {
              const chosen = yield* Prompt.select({
                message: `Module "${definition.title}" implies "${implication.moduleId}". Which ${implication.targetKind} target should receive it?`,
                choices: candidates.map((c) => ({
                  title: `${c.kind}/${c.name}`,
                  value: c.name,
                })),
              });
              const found = candidates.find((c) => c.name === chosen);
              if (found) {
                found.modules.push(implication.moduleId);
                found.confirmed = false;
                changed = true;
              }
            }
          }
        }
      }
    }

    return changed;
  });

/**
 * Build a set of all module IDs that are currently implied by modules in the
 * collection, keyed as "targetKind:moduleId".
 */
const getActiveImplications = (targets: ReadonlyArray<CollectedTarget>) =>
  Effect.gen(function* () {
    const catalog = yield* ModuleCatalog;
    const allModuleIds = targets.flatMap((t) => t.modules);
    return yield* catalog.getImplications(allModuleIds);
  });

/**
 * Remove implications that are no longer needed after a user edits modules.
 */
const removeOrphanedImplications = (targets: Array<CollectedTarget>) =>
  Effect.gen(function* () {
    const catalog = yield* ModuleCatalog;
    const activeImplications = yield* getActiveImplications(targets);
    let changed = false;

    for (const target of targets) {
      const toRemove: Array<typeof ModuleId.Type> = [];
      for (const moduleId of target.modules) {
        const isImplied = yield* catalog.isImpliedByAny(
          moduleId,
          target.kind,
        );
        if (
          isImplied &&
          !activeImplications.has(`${target.kind}:${moduleId}`)
        ) {
          toRemove.push(moduleId);
        }
      }
      if (toRemove.length > 0) {
        target.modules = target.modules.filter((m) => !toRemove.includes(m));
        changed = true;
      }
    }

    // Remove empty targets
    const before = targets.length;
    const remaining = targets.filter((t) => t.modules.length > 0);
    targets.length = 0;
    targets.push(...remaining);
    if (targets.length !== before) changed = true;

    return changed;
  });

const collectTargetsInteractive = Effect.gen(function* () {
  const catalog = yield* ModuleCatalog;
  const targetModuleMap = yield* catalog.targetModuleMap;

  const targets: Array<CollectedTarget> = [];

  const addTarget = Effect.gen(function* () {
    const kind = yield* Prompt.select({
      message: "What kind of target do you want to add?",
      choices: Array.from(targetModuleMap.entries()).map(
        ([value, { title }]) => ({ title, value }),
      ),
    });

    const name = yield* Prompt.text({
      message: `What should this ${kind} target be called?`,
    });

    const targetEntry = targetModuleMap.get(kind);
    const availableModules = targetEntry?.modules ?? [];
    const modules =
      availableModules.length > 0
        ? yield* Prompt.multiSelect({
            message: `Which modules do you want to add to "${kind}/${name}"?`,
            choices: availableModules.map((mod) => ({
              title: mod.title,
              value: mod.id,
              description: mod.description,
            })),
          })
        : [];

    targets.push({ kind, name, modules: [...modules], confirmed: false });
  });

  // Collect first target
  yield* addTarget;

  // Resolve implications (fixed-point)
  let implChanged = true;
  while (implChanged) {
    implChanged = yield* resolveImplications(targets);
  }

  // Confirmation loop
  let allConfirmed = false;
  while (!allConfirmed) {
    yield* Effect.log(`\nCurrent targets:\n${formatTargetSummary(targets)}`);

    const unconfirmed = targets.filter((t) => !t.confirmed);
    if (unconfirmed.length === 0) {
      allConfirmed = true;
      break;
    }

    type Action = "confirm-all" | "edit" | "add";
    const action = yield* Prompt.select<Action>({
      message: "What would you like to do?",
      choices: [
        { title: "Confirm all targets", value: "confirm-all" as Action },
        { title: "Edit a target's modules", value: "edit" as Action },
        { title: "Add another target", value: "add" as Action },
      ],
    });

    if (action === "confirm-all") {
      for (const t of targets) t.confirmed = true;
      allConfirmed = true;
    } else if (action === "edit") {
      const targetToEdit = yield* Prompt.select({
        message: "Which target do you want to edit?",
        choices: targets.map((t, i) => ({
          title: `${t.kind}/${t.name}  [${t.modules.join(", ")}]`,
          value: i,
        })),
      });

      const t = targets[targetToEdit];
      if (t) {
        const targetEntry = targetModuleMap.get(t.kind);
        const availableModules = targetEntry?.modules ?? [];

        if (availableModules.length > 0) {
          const newModules = yield* Prompt.multiSelect({
            message: `Select modules for "${t.kind}/${t.name}":`,
            choices: availableModules.map((mod) => ({
              title: mod.title,
              value: mod.id,
              description: mod.description,
              selected: t.modules.includes(mod.id),
            })),
          });
          t.modules = [...newModules];
          t.confirmed = true;

          // Cascade: remove orphaned implications then re-resolve
          yield* removeOrphanedImplications(targets);
          let changed = true;
          while (changed) {
            changed = yield* resolveImplications(targets);
          }
        } else {
          t.confirmed = true;
        }
      }
    } else {
      yield* addTarget;

      let changed = true;
      while (changed) {
        changed = yield* resolveImplications(targets);
      }
    }
  }

  return targets;
});

export const add = Command.make(
  "add",
  {
    root: rootFlag,
    yes: yesFlag,
    dryRun: dryRunFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const configure = yield* ConfigureService;
      const pipeline = yield* ScaffoldPipeline;

      const repoRoot = Option.getOrElse(flags.root, () => process.cwd());

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
