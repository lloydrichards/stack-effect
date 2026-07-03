import { CatalogService } from "@repo/catalog";
import {
  ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import type { Selection } from "@repo/domain/Selection";
import {
  HorizontalSelect,
  MultiSelect,
  type NestedModuleChild,
  type NestedModuleNode,
  NestedMultiSelect,
  Select,
  TextInput,
} from "@repo/tui";
import {
  Array as Arr,
  Console,
  Effect,
  FileSystem,
  Match,
  Option,
  Predicate,
  pipe,
  Ref,
  Result,
  Schedule,
} from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { Ansi, Box } from "effect-boxes";
import { dryRunFlag, rootFlag, trustFlag, yesFlag } from "../flags";
import { ConfigureService } from "../service/ConfigureService";
import { ScaffoldPipeline } from "../service/ScaffoldPipeline";

type CollectedTarget = {
  kind: typeof TargetKind.Type;
  name: string;
  modules: Array<typeof ModuleId.Type>;
  confirmed: boolean;
};

const targetFlag = Flag.string("target").pipe(
  Flag.optional,
  Flag.withDescription(
    "Target identity as <targetKind>/<targetName>, e.g. client-react/web",
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
 * Build a tree structure for nested module selection showing the full
 * cross-target dependency graph. Each module shows its required dependencies
 * and implied modules as nested children.
 */
const buildModuleTree = (
  modules: ReadonlyArray<typeof ModuleDefinition.Type>,
): Effect.Effect<
  ReadonlyArray<NestedModuleNode<typeof ModuleId.Type>>,
  never,
  CatalogService
> =>
  Effect.gen(function* () {
    const catalog = yield* CatalogService;

    // Collect all module IDs that appear as children of other modules
    // so they are excluded from the top-level list (they appear nested instead)
    const childModuleIds = new Set(
      Arr.flatMap(modules, (mod) =>
        Arr.map(mod.children ?? [], (child) => child.moduleId),
      ),
    );

    // Build tree node recursively, following dependencies and implies
    // visited is a Ref for mutable tracking across sibling branches
    const buildNode = (
      mod: typeof ModuleDefinition.Type,
      requirement: "root" | "required" | "optional",
      visitedRef: Ref.Ref<Set<string>>,
    ): Effect.Effect<
      NestedModuleChild<typeof ModuleId.Type>,
      never,
      CatalogService
    > =>
      Effect.gen(function* () {
        const visited = yield* Ref.get(visitedRef);

        // Skip if already visited (cycle prevention)
        if (visited.has(mod.id)) {
          return {
            node: {
              id: mod.id,
              title: mod.title,
              description: mod.description,
              value: mod.id,
            },
            requirement: requirement === "root" ? "required" : requirement,
          };
        }

        // Mark as visited before processing children
        yield* Ref.update(visitedRef, (s) => new Set([...s, mod.id]));

        // Process required dependencies (cross-target required-module deps)
        // These are included in the tree for visibility, but are filtered out
        // when building the Selection (BlueprintService resolves them automatically).
        const depChildren = yield* pipe(
          mod.dependencies,
          Arr.filter(
            (dep): dep is typeof dep & { _tag: "required-module" } =>
              dep._tag === "required-module",
          ),
          Effect.forEach((dep) =>
            Effect.gen(function* () {
              const depMod = yield* catalog
                .getModule(dep.moduleId)
                .pipe(Effect.orElseSucceed(() => null));

              const currentVisited = yield* Ref.get(visitedRef);
              if (!depMod || currentVisited.has(depMod.id)) {
                return Result.failVoid;
              }

              const childNode = yield* buildNode(
                depMod,
                "required",
                visitedRef,
              );
              return Result.succeed({
                node: {
                  ...childNode.node,
                  title: childNode.node.title,
                  description: childNode.node.description ?? "",
                },
                requirement: "required" as const,
              });
            }),
          ),
          Effect.map(Arr.filterMap((x) => x)),
        );

        // Process implied modules (cross-target)
        const impChildren = yield* pipe(
          mod.implies ?? [],
          Effect.forEach((imp) =>
            Effect.gen(function* () {
              const impMod = yield* catalog
                .getModule(imp.moduleId)
                .pipe(Effect.orElseSucceed(() => null));

              const currentVisited = yield* Ref.get(visitedRef);
              if (!impMod || currentVisited.has(impMod.id)) {
                return Result.failVoid;
              }

              const childNode = yield* buildNode(
                impMod,
                "required",
                visitedRef,
              );
              return Result.succeed({
                node: {
                  ...childNode.node,
                  title: childNode.node.title,
                  description: childNode.node.description ?? "",
                },
                requirement: "required" as const,
              });
            }),
          ),
          Effect.map(Arr.filterMap((x) => x)),
        );

        // Process same-target children (optional sub-modules)
        const subChildren = yield* pipe(
          mod.children ?? [],
          Effect.forEach((child) =>
            Effect.gen(function* () {
              const childMod = yield* catalog
                .getModule(child.moduleId)
                .pipe(Effect.orElseSucceed(() => null));

              const currentVisited = yield* Ref.get(visitedRef);
              if (!childMod || currentVisited.has(childMod.id)) {
                return Result.failVoid;
              }

              const childNode = yield* buildNode(
                childMod,
                child.requirement,
                visitedRef,
              );
              return Result.succeed({
                node: childNode.node,
                requirement: child.requirement,
              });
            }),
          ),
          Effect.map(Arr.filterMap((x) => x)),
        );

        const children = [...depChildren, ...impChildren, ...subChildren];
        const base = {
          id: mod.id,
          title: mod.title,
          description: mod.description,
          value: mod.id,
        };

        return {
          node: Arr.isArrayNonEmpty(children) ? { ...base, children } : base,
          requirement: requirement === "root" ? "required" : requirement,
        };
      });

    // Build tree for each top-level module (each with fresh visited Ref)
    // Exclude modules that are children of other modules in this set
    const topLevelModules = Arr.filter(
      modules,
      (mod) => !childModuleIds.has(mod.id),
    );
    return yield* Effect.forEach(topLevelModules, (mod) =>
      Effect.gen(function* () {
        const visitedRef = yield* Ref.make(new Set<string>());
        const result = yield* buildNode(mod, "root", visitedRef);
        return result.node;
      }),
    );
  });

/**
 * Resolve module implications: when a module implies another module on a
 * different target kind, ensure that target+module exists in the collection.
 * Returns true if any new implications were added.
 */
const resolveImplications = (targets: Array<CollectedTarget>) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogService;
    let changed = false;

    yield* Effect.forEach(targets, (target) =>
      Effect.forEach(target.modules, (moduleId) =>
        Effect.gen(function* () {
          const definition = yield* catalog.getModule(moduleId);

          yield* Effect.forEach(definition.implies ?? [], (implication) =>
            Effect.gen(function* () {
              const candidates = Arr.filter(
                targets,
                (t) => t.kind === implication.targetKind,
              );

              yield* pipe(
                Match.value(candidates.length),
                Match.when(0, () =>
                  Effect.gen(function* () {
                    const name = yield* TextInput({
                      message: `Module "${definition.title}" requires a ${implication.targetKind} target. What should it be called?`,
                    });
                    targets.push({
                      kind: implication.targetKind,
                      name,
                      modules: [implication.moduleId],
                      confirmed: false,
                    });
                    changed = true;
                  }),
                ),
                Match.when(1, () =>
                  Effect.gen(function* () {
                    const candidate = candidates[0];
                    if (
                      candidate &&
                      !Arr.contains(candidate.modules, implication.moduleId)
                    ) {
                      candidate.modules.push(implication.moduleId);
                      candidate.confirmed = false;
                      changed = true;
                    }
                  }),
                ),
                Match.orElse(() =>
                  Effect.gen(function* () {
                    const alreadyPresent = Arr.some(candidates, (c) =>
                      Arr.contains(c.modules, implication.moduleId),
                    );
                    if (!alreadyPresent) {
                      const chosen = yield* Select({
                        message: `Module "${definition.title}" implies "${implication.moduleId}". Which ${implication.targetKind} target should receive it?`,
                        choices: Arr.map(candidates, (c) => ({
                          title: `${c.kind}/${c.name}`,
                          value: c.name,
                        })),
                      });
                      const found = Arr.findFirst(
                        candidates,
                        (c) => c.name === chosen,
                      );
                      if (Option.isSome(found)) {
                        found.value.modules.push(implication.moduleId);
                        found.value.confirmed = false;
                        changed = true;
                      }
                    }
                  }),
                ),
              );
            }),
          );
        }),
      ),
    );

    return changed;
  });

/**
 * Build a set of all module IDs that are currently implied by modules in the
 * collection, keyed as "targetKind:moduleId".
 */
const getActiveImplications = (targets: ReadonlyArray<CollectedTarget>) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogService;
    const allModuleIds = Arr.flatMap(targets, (t) => t.modules);
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

    yield* Effect.forEach(targets, (target) =>
      Effect.gen(function* () {
        const toRemove = yield* pipe(
          target.modules,
          Effect.filter((moduleId) =>
            Effect.gen(function* () {
              if (pinned.has(`${target.kind}:${moduleId}`)) return false;
              const isImplied = yield* catalog.isImpliedByAny(
                moduleId,
                target.kind,
              );
              return (
                isImplied &&
                !activeImplications.has(`${target.kind}:${moduleId}`)
              );
            }),
          ),
        );

        if (Arr.isArrayNonEmpty(toRemove)) {
          target.modules = Arr.filter(
            target.modules,
            (m) => !Arr.contains(toRemove, m),
          );
          changed = true;
        }
      }),
    );

    // Remove empty targets
    const before = targets.length;
    const remaining = Arr.filter(targets, (t) =>
      Arr.isArrayNonEmpty(t.modules),
    );
    targets.length = 0;
    targets.push(...remaining);
    if (targets.length !== before) changed = true;

    return changed;
  });

const resolveImplicationsNonInteractive = (
  targets: Array<CollectedTarget>,
  repoRoot: string,
) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogService;
    const fs = yield* FileSystem.FileSystem;

    let changed = true;
    while (changed) {
      changed = false;

      yield* Effect.forEach(targets, (target) =>
        Effect.forEach(target.modules, (moduleId) =>
          Effect.gen(function* () {
            const definition = yield* catalog.getModule(moduleId);

            yield* Effect.forEach(definition.implies ?? [], (implication) =>
              Effect.gen(function* () {
                const candidates = Arr.filter(
                  targets,
                  (t) => t.kind === implication.targetKind,
                );

                yield* pipe(
                  Match.value(candidates.length),
                  Match.when(0, () =>
                    Effect.gen(function* () {
                      // Check if the implied target/module already exists on disk
                      const appsDir = `${repoRoot}/apps`;
                      const packagesDir = `${repoRoot}/packages`;
                      const searchDir =
                        implication.targetKind === "package"
                          ? packagesDir
                          : appsDir;
                      const prefix =
                        implication.targetKind === "package"
                          ? ""
                          : `${implication.targetKind}-`;

                      const dirExists = yield* pipe(
                        fs.readDirectory(searchDir),
                        Effect.map((entries) =>
                          Arr.some(
                            entries,
                            (entry) =>
                              implication.targetKind === "package" ||
                              entry.startsWith(prefix) ||
                              entry === implication.targetKind,
                          ),
                        ),
                        Effect.catch(() => Effect.succeed(false)),
                      );

                      if (!dirExists) {
                        return yield* Effect.fail(
                          `Module "${definition.id}" implies "${implication.moduleId}" on target kind "${implication.targetKind}". Non-interactive mode requires explicit support for implied targets. Use interactive add or choose modules without cross-target implications.`,
                        );
                      }
                    }),
                  ),
                  Match.when(
                    (n) => n > 1,
                    () =>
                      Effect.gen(function* () {
                        const alreadyPresent = Arr.some(candidates, (c) =>
                          Arr.contains(c.modules, implication.moduleId),
                        );
                        if (!alreadyPresent) {
                          return yield* Effect.fail(
                            `Module "${definition.id}" implies "${implication.moduleId}" for target kind "${implication.targetKind}", but multiple candidate targets exist. Use interactive add to disambiguate.`,
                          );
                        }
                      }),
                  ),
                  Match.orElse(() =>
                    Effect.gen(function* () {
                      const candidate = candidates[0];
                      if (
                        candidate &&
                        !Arr.contains(candidate.modules, implication.moduleId)
                      ) {
                        candidate.modules.push(implication.moduleId);
                        changed = true;
                      }
                    }),
                  ),
                );
              }),
            );
          }),
        ),
      );
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
    if (kind === "workspace") {
      return yield* Effect.fail(
        'The add command cannot target kind "workspace". Use stack-effect init for project initialization.',
      );
    }

    return {
      kind,
      name,
    };
  });

const parseModuleInputs = (rawModules: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const parts = pipe(
      rawModules,
      Arr.flatMap((entry) =>
        pipe(
          entry.split(","),
          Arr.map((part) => part.trim()),
          Arr.filter((part) => part.length > 0),
        ),
      ),
    );

    if (Arr.isArrayEmpty(parts)) {
      return yield* Effect.fail(
        "At least one module ID is required when using --modules.",
      );
    }

    // Find duplicates using Array.groupBy
    const grouped = Arr.groupBy(parts, (id) => id);
    const duplicates = pipe(
      Object.entries(grouped),
      Arr.filter(([, items]) => items.length > 1),
      Arr.map(([id]) => id),
    );

    if (Arr.isArrayNonEmpty(duplicates)) {
      return yield* Effect.fail(
        `Duplicate module IDs provided: ${Arr.join(duplicates, ", ")}`,
      );
    }

    return Arr.map(parts, (moduleId) => ModuleId.make(moduleId));
  });

const collectTargetsFromFlags = (
  targetId: string,
  rawModules: ReadonlyArray<string>,
  repoRoot: string,
) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogService;

    const parsedTarget = yield* parseTargetIdentity(targetId);
    const targetIdentity = new TargetIdentity({
      kind: parsedTarget.kind,
      name: parsedTarget.name,
    });

    yield* pipe(
      catalog.getTarget(targetIdentity.kind),
      Effect.mapError(
        () =>
          `Unknown target kind "${targetIdentity.kind}" in --target value "${targetId}".`,
      ),
    );

    const moduleIds = yield* parseModuleInputs(rawModules);

    // Validate modules and collect unsupported ones
    const unsupported = yield* pipe(
      moduleIds,
      Effect.filter((moduleId) =>
        Effect.gen(function* () {
          yield* pipe(
            catalog.getModule(moduleId),
            Effect.mapError(
              () => `Unknown module ID "${moduleId}" provided via --modules.`,
            ),
          );
          const isSupported = yield* catalog.isSupportedOn(
            moduleId,
            targetIdentity,
          );
          return !isSupported;
        }),
      ),
    );

    if (Arr.isArrayNonEmpty(unsupported)) {
      return yield* Effect.fail(
        `Unsupported module(s) for target ${targetIdentity.kind}/${targetIdentity.name}: ${Arr.join(unsupported, ", ")}`,
      );
    }

    const targets: Array<CollectedTarget> = [
      {
        kind: parsedTarget.kind,
        name: parsedTarget.name,
        modules: [...moduleIds],
        confirmed: true,
      },
    ];

    yield* resolveImplicationsNonInteractive(targets, repoRoot);

    return targets;
  });

const isScaffoldAborted = (
  err: unknown,
): err is { _tag: "ScaffoldAborted"; retry?: boolean } =>
  Predicate.isTagged("ScaffoldAborted")(err);

const collectTargetsInteractive = Effect.gen(function* () {
  const catalog = yield* CatalogService;

  // Build target kind choices from catalog (public targets only)
  const targetChoices = yield* pipe(
    catalog.getTargetKinds({ visibility: "public" }),
    Effect.forEach((kind) =>
      Effect.gen(function* () {
        const target = yield* catalog.getTarget(kind);
        return { title: target.title, value: kind };
      }),
    ),
  );

  const targets: Array<CollectedTarget> = [];

  const addTarget = Effect.gen(function* () {
    const kind = yield* HorizontalSelect({
      message: "What kind of target do you want to add?",
      choices: targetChoices,
    });

    const name = yield* TextInput({
      message: `What should this ${kind} target be called?`,
      validate: (v) =>
        v.trim().length > 0
          ? Effect.succeed(v.trim())
          : Effect.fail("Target name cannot be empty"),
    });

    const availableModules = yield* catalog.getSupportedModules(kind, {
      visibility: "public",
    });

    // Build nested tree structure for module selection
    const moduleTree = yield* buildModuleTree(availableModules);

    const modules = Arr.isReadonlyArrayNonEmpty(moduleTree)
      ? yield* NestedMultiSelect({
          message: `Which modules do you want to add to "${kind}/${name}"?`,
          choices: moduleTree,
        })
      : [];

    targets.push({ kind, name, modules: [...modules], confirmed: false });
  });

  // Collect first target
  yield* addTarget;

  // The user explicitly chose modules for the first target, mark it confirmed
  pipe(
    Option.fromNullishOr(targets[0]),
    Option.filter((t) => Arr.isArrayNonEmpty(t.modules)),
    Option.map((t) => {
      t.confirmed = true;
    }),
  );

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
        ).pipe(Box.pad(0, 1), Box.border("rounded", { annotation: Ansi.dim })),
      ),
    );

    const action = yield* HorizontalSelect<"confirm-all" | "edit" | "add">({
      message: "What would you like to do?",
      choices: [
        { title: "Confirm all", value: "confirm-all" },
        { title: "Edit modules", value: "edit" },
        { title: "Add target", value: "add" },
      ],
    });

    yield* pipe(
      Match.value(action),
      Match.when("confirm-all", () =>
        Effect.sync(() => {
          Arr.forEach(targets, (t) => {
            t.confirmed = true;
          });
          allConfirmed = true;
        }),
      ),
      Match.when("edit", () =>
        Effect.gen(function* () {
          const targetToEdit = yield* Select({
            message: "Which target do you want to edit?",
            choices: Arr.map(targets, (t, i) => ({
              title: `${t.kind}/${t.name}  [${Arr.join(t.modules, ", ")}]`,
              value: i,
            })),
          });

          yield* pipe(
            Option.fromNullishOr(targets[targetToEdit]),
            Option.match({
              onNone: () => Effect.void,
              onSome: (t) =>
                Effect.gen(function* () {
                  const availableModules = yield* catalog.getSupportedModules(
                    t.kind,
                    { visibility: "public" },
                  );

                  if (Arr.isReadonlyArrayNonEmpty(availableModules)) {
                    const moduleTree = yield* buildModuleTree(availableModules);

                    const newModules = yield* NestedMultiSelect({
                      message: `Select modules for "${t.kind}/${t.name}":`,
                      choices: moduleTree,
                      initialSelected: t.modules,
                    });
                    t.modules = [...newModules];
                    t.confirmed = true;

                    // Cascade: remove orphaned implications then re-resolve
                    const pinned = new Set(
                      Arr.map(newModules, (m) => `${t.kind}:${m}`),
                    );
                    yield* removeOrphanedImplications(targets, pinned);
                    let changed = true;
                    while (changed) {
                      changed = yield* resolveImplications(targets);
                    }
                  } else {
                    t.confirmed = true;
                  }
                }),
            }),
          );
        }),
      ),
      Match.when("add", () =>
        Effect.gen(function* () {
          yield* addTarget;

          let changed = true;
          while (changed) {
            changed = yield* resolveImplications(targets);
          }
        }),
      ),
      Match.exhaustive,
    );
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
    trust: trustFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const configure = yield* ConfigureService;
      const pipeline = yield* ScaffoldPipeline;
      const catalog = yield* CatalogService;

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
              repoRoot,
            )
          : yield* collectTargetsInteractive;

      // Build selection, routing each module to the target it's supported on.
      // Cross-target module IDs that appeared in the TUI tree (e.g., toolkit
      // children of a parent on another target) are placed on the correct target.
      // BlueprintService will also resolve required-module deps automatically.
      const selectionTargets = new Map<
        string,
        { identity: TargetIdentity; modules: Set<string> }
      >();

      // Seed with collected targets
      for (const t of collected) {
        const identity = new TargetIdentity({ kind: t.kind, name: t.name });
        selectionTargets.set(identity.toKey(), {
          identity,
          modules: new Set(),
        });
      }

      // Route each module to its supported target
      yield* Effect.forEach(collected, (t) =>
        Effect.gen(function* () {
          const identity = new TargetIdentity({ kind: t.kind, name: t.name });
          yield* Effect.forEach(Arr.dedupe(t.modules), (id) =>
            Effect.gen(function* () {
              // Check if supported on the collected target first
              const ownSupported = yield* catalog
                .isSupportedOn(id, identity)
                .pipe(Effect.orElseSucceed(() => false));
              if (ownSupported) {
                selectionTargets.get(identity.toKey())!.modules.add(id);
                return;
              }

              // Find which target this module belongs to
              const mod = yield* catalog
                .getModule(id)
                .pipe(Effect.orElseSucceed(() => null));
              if (!mod) return;

              for (const rule of mod.supportedOn) {
                if (rule._tag === "identity") {
                  const targetKey = new TargetIdentity(rule.identity).toKey();
                  if (!selectionTargets.has(targetKey)) {
                    selectionTargets.set(targetKey, {
                      identity: new TargetIdentity(rule.identity),
                      modules: new Set(),
                    });
                  }
                  selectionTargets.get(targetKey)!.modules.add(id);
                  return;
                }
                if (rule._tag === "kind") {
                  // Find existing target of this kind
                  const existing = Arr.findFirst(collected, (c) =>
                    c.kind === rule.kind ? true : false,
                  );
                  if (Option.isSome(existing)) {
                    const key = new TargetIdentity({
                      kind: existing.value.kind,
                      name: existing.value.name,
                    }).toKey();
                    selectionTargets.get(key)!.modules.add(id);
                    return;
                  }
                }
              }
            }),
          );
        }),
      );

      const selection: typeof Selection.Type = {
        targets: Arr.fromIterable(selectionTargets.values()).map((entry) => ({
          identity: entry.identity,
          modules: Arr.fromIterable(entry.modules).map((id) => ({
            id: id as typeof ModuleId.Type,
          })),
        })),
      };

      yield* pipeline.run({
        selection,
        repoRoot,
        yes: flags.yes,
        dryRun: flags.dryRun,
        trust: flags.trust || flags.yes,
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
).pipe(
  Command.withDescription(
    "Incrementally add targets and modules to a scaffolded project. Resolves dependencies and implications automatically.",
  ),
  Command.withShortDescription("Add targets or modules to an existing project"),
  Command.withExamples([
    {
      command: "stack-effect add",
      description: "Interactively select targets and modules",
    },
    {
      command: "stack-effect add --target server/api --modules http-api",
      description: "Add a specific module to a target",
    },
    {
      command:
        "stack-effect add --yes --target package/domain --modules domain-api-contracts --dry-run",
      description: "Non-interactive dry run for CI/LLM usage",
    },
  ]),
);
