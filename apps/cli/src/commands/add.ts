import { CatalogService } from "@repo/catalog";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import type { Selection } from "@repo/domain/Selection";
import { Console, Effect, Option, Schedule } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";
import { Ansi, Box } from "effect-boxes";
import { Border } from "../components/Border";
import { HorizontalRadio } from "../components/HorizontalRadio";
import { Padding } from "../components/Padding";
import { dryRunFlag, rootFlag, yesFlag } from "../flags";
import { ConfigureService } from "../service/ConfigureService";
import { ScaffoldPipeline } from "../service/ScaffoldPipeline";

interface CollectedTarget {
  kind: Exclude<typeof TargetKind.Type, "init">;
  name: string;
  modules: Array<typeof ModuleId.Type>;
  confirmed: boolean;
}

const targetFlag = Flag.string("target").pipe(
  Flag.optional,
  Flag.withDescription(
    "Target identity as <targetKind>/<targetName>, e.g. client/web",
  ),
);

const modulesFlag = Flag.string("modules").pipe(
  Flag.atLeast(1),
  Flag.optional,
  Flag.withDescription(
    "Module IDs (repeat --modules or use comma-separated values)",
  ),
);

const formatTargetSummary = (
  targets: ReadonlyArray<CollectedTarget>,
): Box.Box<Ansi.AnsiStyle> => {
  const statuses = targets.map((t) =>
    t.confirmed
      ? Box.char("✓").pipe(Box.annotate(Ansi.green))
      : Box.char("○").pipe(Box.annotate(Ansi.dim)),
  );

  const labels = targets.map((t) =>
    Box.text(`${t.kind}/${t.name}`).pipe(Box.annotate(Ansi.bold)),
  );

  const modules = targets.map((t) =>
    t.modules.length > 0
      ? Box.text(t.modules.join(", ")).pipe(Box.annotate(Ansi.cyan))
      : Box.text("(no modules)").pipe(Box.annotate(Ansi.dim)),
  );

  return Box.hsep(
    [
      Box.vcat(statuses, Box.center1),
      Box.vcat(labels, Box.left),
      Box.vcat(modules, Box.left),
    ],
    2,
    Box.top,
  );
};

/**
 * Resolve module implications: when a module implies another module on a
 * different target kind, ensure that target+module exists in the collection.
 * Returns true if any new implications were added.
 */
const resolveImplications = (targets: Array<CollectedTarget>) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogService;
    let changed = false;

    for (const target of targets) {
      for (const moduleId of target.modules) {
        const definition = yield* catalog.getModule(moduleId);
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
    const catalog = yield* CatalogService;
    const allModuleIds = targets.flatMap((t) => t.modules);
    return yield* catalog.getImplications(allModuleIds);
  });

/**
 * Remove implications that are no longer needed after a user edits modules.
 * Modules in `pinned` were explicitly selected by the user and must not be
 * removed even if they are no longer actively implied.
 */
const removeOrphanedImplications = (
  targets: Array<CollectedTarget>,
  pinned: ReadonlySet<string> = new Set(),
) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogService;
    const activeImplications = yield* getActiveImplications(targets);
    let changed = false;

    for (const target of targets) {
      const toRemove: Array<typeof ModuleId.Type> = [];
      for (const moduleId of target.modules) {
        if (pinned.has(`${target.kind}:${moduleId}`)) continue;
        const isImplied = yield* catalog.isImpliedByAny(moduleId, target.kind);
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

const resolveImplicationsNonInteractive = (targets: Array<CollectedTarget>) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogService;

    let changed = true;
    while (changed) {
      changed = false;

      for (const target of targets) {
        for (const moduleId of target.modules) {
          const definition = yield* catalog.getModule(moduleId);

          for (const implication of definition.implies ?? []) {
            const candidates = targets.filter(
              (t) => t.kind === implication.targetKind,
            );

            if (candidates.length === 0) {
              return yield* Effect.fail(
                `Module \"${definition.id}\" implies \"${implication.moduleId}\" on target kind \"${implication.targetKind}\". Non-interactive mode requires explicit support for implied targets. Use interactive add or choose modules without cross-target implications.`,
              );
            }

            if (candidates.length > 1) {
              const alreadyPresent = candidates.some((c) =>
                c.modules.includes(implication.moduleId),
              );
              if (!alreadyPresent) {
                return yield* Effect.fail(
                  `Module \"${definition.id}\" implies \"${implication.moduleId}\" for target kind \"${implication.targetKind}\", but multiple candidate targets exist. Use interactive add to disambiguate.`,
                );
              }
            }

            const candidate = candidates[0];
            if (
              candidate &&
              !candidate.modules.includes(implication.moduleId)
            ) {
              candidate.modules.push(implication.moduleId);
              changed = true;
            }
          }
        }
      }
    }

    return targets;
  });

const parseTargetIdentity = (targetId: string) =>
  Effect.gen(function* () {
    const value = targetId.trim();
    const separatorIndex = value.indexOf("/");

    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      return yield* Effect.fail(
        "Invalid --target value. Expected format: <targetKind>/<targetName>.",
      );
    }

    const kindText = value.slice(0, separatorIndex).trim();
    const name = value.slice(separatorIndex + 1).trim();

    if (kindText.length === 0 || name.length === 0) {
      return yield* Effect.fail(
        "Invalid --target value. targetKind and targetName must both be non-empty.",
      );
    }

    const kind = TargetKind.make(kindText);
    if (kind === "init") {
      return yield* Effect.fail(
        'The add command cannot target kind "init". Use stack-effect init for project initialization.',
      );
    }

    return {
      kind: kind as Exclude<typeof TargetKind.Type, "init">,
      name,
    };
  });

const parseModuleInputs = (rawModules: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const parts = rawModules.flatMap((entry) =>
      entry
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    );

    if (parts.length === 0) {
      return yield* Effect.fail(
        "At least one module ID is required when using --modules.",
      );
    }

    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const moduleId of parts) {
      if (seen.has(moduleId)) {
        duplicates.add(moduleId);
      } else {
        seen.add(moduleId);
      }
    }

    if (duplicates.size > 0) {
      return yield* Effect.fail(
        `Duplicate module IDs provided: ${Array.from(duplicates).join(", ")}`,
      );
    }

    return parts.map((moduleId) => ModuleId.make(moduleId));
  });

const collectTargetsFromFlags = (
  targetId: string,
  rawModules: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogService;

    const parsedTarget = yield* parseTargetIdentity(targetId);
    const targetIdentity = new TargetIdentity({
      kind: parsedTarget.kind,
      name: parsedTarget.name,
    });

    yield* catalog
      .getTarget(targetIdentity.kind)
      .pipe(
        Effect.mapError(
          () =>
            `Unknown target kind \"${targetIdentity.kind}\" in --target value \"${targetId}\".`,
        ),
      );

    const moduleIds = yield* parseModuleInputs(rawModules);
    const unsupported: Array<string> = [];

    for (const moduleId of moduleIds) {
      yield* catalog
        .getModule(moduleId)
        .pipe(
          Effect.mapError(
            () => `Unknown module ID \"${moduleId}\" provided via --modules.`,
          ),
        );

      const isSupported = yield* catalog.isSupportedOn(
        moduleId,
        targetIdentity,
      );
      if (!isSupported) {
        unsupported.push(moduleId);
      }
    }

    if (unsupported.length > 0) {
      return yield* Effect.fail(
        `Unsupported module(s) for target ${targetIdentity.kind}/${targetIdentity.name}: ${unsupported.join(", ")}`,
      );
    }

    const targets: Array<CollectedTarget> = [
      {
        kind: parsedTarget.kind,
        name: parsedTarget.name,
        modules: moduleIds,
        confirmed: true,
      },
    ];

    yield* resolveImplicationsNonInteractive(targets);

    return targets;
  });

const isScaffoldAborted = (
  err: unknown,
): err is { _tag: "ScaffoldAborted"; retry?: boolean } =>
  typeof err === "object" &&
  err !== null &&
  "_tag" in err &&
  (err as { _tag?: unknown })._tag === "ScaffoldAborted";

const collectTargetsInteractive = Effect.gen(function* () {
  const catalog = yield* CatalogService;

  // Build target kind choices from catalog
  const targetChoices: Array<{
    title: string;
    value: Exclude<typeof TargetKind.Type, "init">;
  }> = [];
  for (const kind of catalog.targetKinds) {
    const target = yield* catalog.getTarget(kind);
    targetChoices.push({ title: target.title, value: kind });
  }

  const targets: Array<CollectedTarget> = [];

  const addTarget = Effect.gen(function* () {
    const kind = yield* HorizontalRadio({
      message: "What kind of target do you want to add?",
      choices: targetChoices,
    });

    const name = yield* Prompt.text({
      message: `What should this ${kind} target be called?`,
    });

    const availableModules = yield* catalog.getSupportedModules(kind);
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

  // The user explicitly chose modules for the first target, mark it confirmed
  if (targets[0] && targets[0].modules.length > 0) {
    targets[0].confirmed = true;
  }

  // Resolve implications (fixed-point)
  let implChanged = true;
  while (implChanged) {
    implChanged = yield* resolveImplications(targets);
  }

  // Confirmation loop
  let allConfirmed = false;
  while (!allConfirmed) {
    yield* Console.log(
      Box.renderPrettySync(
        Box.vsep(
          [
            Box.text("Current targets and modules:").pipe(
              Box.annotate(Ansi.bold),
            ),
            formatTargetSummary(targets),
          ],
          1,
          Box.left,
        ).pipe(Padding(0, 1), Border),
      ),
    );

    const action = yield* HorizontalRadio<"confirm-all" | "edit" | "add">({
      message: "What would you like to do?",
      choices: [
        { title: "Confirm all", value: "confirm-all" },
        { title: "Edit modules", value: "edit" },
        { title: "Add target", value: "add" },
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
        const availableModules = yield* catalog.getSupportedModules(t.kind);

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
          // Pin the user's explicit selections so they aren't stripped
          const pinned = new Set(newModules.map((m) => `${t.kind}:${m}`));
          yield* removeOrphanedImplications(targets, pinned);
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
    target: targetFlag,
    modules: modulesFlag,
    yes: yesFlag,
    dryRun: dryRunFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const configure = yield* ConfigureService;
      const pipeline = yield* ScaffoldPipeline;

      const repoRoot = Option.getOrElse(flags.root, () => process.cwd());

      // Require init
      const config = yield* configure.requireConfig(repoRoot);

      const hasTarget = Option.isSome(flags.target);
      const hasModules = Option.isSome(flags.modules);

      if (hasTarget !== hasModules) {
        return yield* Effect.fail(
          "Use --target and --modules together, or omit both to use interactive mode.",
        );
      }

      // Collect targets: use flags if provided, otherwise interactive loop
      const collected =
        hasTarget && hasModules
          ? yield* collectTargetsFromFlags(
              flags.target.value,
              flags.modules.value,
            )
          : yield* collectTargetsInteractive;

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
        config,
      });
    }).pipe(
      Effect.retry({
        while: (err) => isScaffoldAborted(err) && err.retry === true,
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
