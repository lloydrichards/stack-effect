import { CatalogReader } from "@repo/catalog/Catalog";
import type {
  CatalogNotFound,
  ModuleCapability,
  ModuleChild,
  ModuleDefinition,
  ModuleId,
  ModuleImplication,
  TargetKind,
} from "@repo/domain/Catalog";
import { ModuleDependency, TargetIdentity } from "@repo/domain/Catalog";
import {
  parseRecipeTargetSpecs,
  RecipeResolveOptions,
  type RecipeTargetSpec,
} from "@repo/domain/Recipe";
import { RecipeResolver } from "@repo/scaffold/Recipe";
import {
  HorizontalSelect,
  type NestedModuleChild,
  NestedMultiSelect,
  Select,
  TextInput,
} from "@repo/tui";
import {
  Array as Arr,
  Console,
  Effect,
  Match,
  Option,
  Ref,
  Schedule,
  Schema,
  Terminal,
} from "effect";
import { Ansi, Box } from "effect-boxes";
import { Command } from "effect/cli";
import {
  catalogFlag,
  dryRunFlag,
  recipeTargetFlag,
  rootFlag,
  showFilesFlag,
  trustFlag,
  yesFlag,
} from "../flags";
import { decodeRunFlags } from "../lib/runMode";
import { ConfigureService } from "../service/ConfigureService";
import { ScaffoldAborted, ScaffoldPipeline } from "../service/ScaffoldPipeline";

type CollectedTarget = {
  kind: TargetKind;
  name: string;
  modules: Array<ModuleId>;
  confirmed: boolean;
};

const validateTargetName = (kind: TargetKind) => (value: string) =>
  Schema.decodeEffect(TargetIdentity)({ kind, name: value }).pipe(
    Effect.map((identity) => identity.name),
    Effect.mapError(() =>
      kind === "package"
        ? "Package names must contain safe, non-empty directory segments"
        : "Target names must contain safe directory segments",
    ),
  );

const wasTargetFlagProvided = (args: ReadonlyArray<string>) =>
  Arr.some(args, (arg) => arg === "--target" || arg.startsWith("--target="));

const formatTargetSummary = (
  targets: ReadonlyArray<CollectedTarget>,
  width: number,
) => {
  const labelWidth = Math.max(
    ...targets.map((t) => `${t.kind}/${t.name}`.length),
    0,
  );
  const moduleWidth = Math.max(20, width - labelWidth - 5);

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
      ? Box.para(t.modules.join(", "), Box.left, moduleWidth).pipe(
          Box.annotate(Ansi.cyan),
        )
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

type ChildRef = Pick<ModuleChild, "moduleId" | "requirement">;

const requiredChild = (moduleId: ModuleId): ChildRef => ({
  moduleId,
  requirement: "required",
});

// Required modules and implications show as required children of the module that pulls them in.
const childRefsOf = (mod: ModuleDefinition) => [
  ...mod.dependencies
    .filter(ModuleDependency.guards["required-module"])
    .map((dependency) => requiredChild(dependency.moduleId)),
  ...(mod.implies ?? []).map((implication) =>
    requiredChild(implication.moduleId),
  ),
  ...(mod.children ?? []),
];

const buildNode = (
  mod: ModuleDefinition,
  requirement: ChildRef["requirement"],
  visitedRef: Ref.Ref<ReadonlySet<string>>,
): Effect.Effect<NestedModuleChild<ModuleId>, never, CatalogReader> =>
  Effect.gen(function* () {
    const node = {
      id: mod.id,
      title: mod.title,
      description: mod.description,
      value: mod.id,
    };
    if ((yield* Ref.get(visitedRef)).has(mod.id)) return { node, requirement };

    yield* Ref.update(visitedRef, (visited) => new Set([...visited, mod.id]));
    const children = Arr.getSomes(
      yield* Effect.forEach(childRefsOf(mod), (ref) =>
        buildChild(ref, visitedRef),
      ),
    );

    return {
      node: Arr.isArrayNonEmpty(children) ? { ...node, children } : node,
      requirement,
    };
  });

const buildChild = Effect.fnUntraced(function* (
  ref: ChildRef,
  visitedRef: Ref.Ref<ReadonlySet<string>>,
) {
  const catalog = yield* CatalogReader;
  const child = yield* Effect.option(catalog.getModule(ref.moduleId));
  if (
    Option.isNone(child) ||
    (yield* Ref.get(visitedRef)).has(child.value.id)
  ) {
    return Option.none();
  }
  return Option.some(
    yield* buildNode(child.value, ref.requirement, visitedRef),
  );
});

const buildRoot = Effect.fnUntraced(function* (mod: ModuleDefinition) {
  const visitedRef = yield* Ref.make<ReadonlySet<string>>(new Set());
  return (yield* buildNode(mod, "required", visitedRef)).node;
});

/**
 * Build the nested module picker from catalog dependency metadata. Cross-target
 * children are shown for visibility, but Selection construction routes each
 * chosen module back to its owning target.
 */
const buildModuleTree = (modules: ReadonlyArray<ModuleDefinition>) => {
  const childModuleIds = new Set(
    modules.flatMap((mod) =>
      (mod.children ?? []).map((child) => child.moduleId),
    ),
  );
  return Effect.forEach(
    modules.filter((mod) => !childModuleIds.has(mod.id)),
    buildRoot,
  );
};

const placeImplication = Effect.fnUntraced(function* (
  targets: Array<CollectedTarget>,
  definition: ModuleDefinition,
  implication: ModuleImplication,
) {
  const candidates = targets.filter(
    (target) => target.kind === implication.targetKind,
  );

  if (!Arr.isArrayNonEmpty(candidates)) {
    const name = yield* TextInput({
      message: `Module "${definition.title}" requires a ${implication.targetKind} target. What should it be called?`,
      validate: validateTargetName(implication.targetKind),
    });
    targets.push({
      kind: implication.targetKind,
      name,
      modules: [implication.moduleId],
      confirmed: false,
    });
    return true;
  }

  if (
    candidates.some((candidate) =>
      candidate.modules.includes(implication.moduleId),
    )
  ) {
    return false;
  }

  const receiver =
    candidates.length === 1
      ? candidates[0]
      : yield* Select({
          message: `Module "${definition.title}" implies "${implication.moduleId}". Which ${implication.targetKind} target should receive it?`,
          choices: candidates.map((candidate) => ({
            title: `${candidate.kind}/${candidate.name}`,
            value: candidate,
          })),
        });
  receiver.modules.push(implication.moduleId);
  receiver.confirmed = false;
  return true;
});

// An implied module may live on another target kind; place it there, adding the target if needed.
const resolveImplications = Effect.fnUntraced(function* (
  targets: Array<CollectedTarget>,
) {
  const catalog = yield* CatalogReader;
  const definitions = yield* Effect.forEach(
    targets.flatMap((target) => target.modules),
    catalog.getModule,
  );

  // NOTE: BlueprintResolver resolves required-module deps; this prompt only places implied modules.
  const placed = yield* Effect.forEach(
    definitions.flatMap((definition) =>
      (definition.implies ?? []).map((implication) => ({
        definition,
        implication,
      })),
    ),
    ({ definition, implication }) =>
      placeImplication(targets, definition, implication),
  );
  return placed.some(Boolean);
});

const resolveImplicationsInteractive = Effect.fnUntraced(function* (
  targets: Array<CollectedTarget>,
) {
  let changed = true;
  while (changed) {
    changed = yield* resolveImplications(targets);
  }
});

const implicationKey = (kind: TargetKind, moduleId: ModuleId) =>
  `${kind}:${moduleId}`;

/**
 * Remove implications that are no longer needed after a user edits modules.
 * Modules in `pinned` were explicitly selected by the user and must not be
 * removed even if they are no longer actively implied.
 */
const removeOrphanedImplications = Effect.fnUntraced(function* (
  targets: Array<CollectedTarget>,
  pinned: ReadonlySet<string>,
) {
  const catalog = yield* CatalogReader;
  const active = yield* catalog.getImplications(
    targets.flatMap((target) => target.modules),
  );

  const unpinnedInactive = targets.flatMap(({ kind, modules }) =>
    modules
      .filter((moduleId) => {
        const key = implicationKey(kind, moduleId);
        return !pinned.has(key) && !active.has(key);
      })
      .map((moduleId) => ({ kind, moduleId })),
  );
  const orphans = yield* Effect.filter(unpinnedInactive, ({ kind, moduleId }) =>
    catalog.isImpliedByAny(moduleId, kind),
  );
  const orphanKeys = new Set(
    orphans.map(({ kind, moduleId }) => implicationKey(kind, moduleId)),
  );

  for (const target of targets) {
    target.modules = target.modules.filter(
      (moduleId) => !orphanKeys.has(implicationKey(target.kind, moduleId)),
    );
  }
  targets.splice(
    0,
    targets.length,
    ...targets.filter((target) => Arr.isArrayNonEmpty(target.modules)),
  );
});

const findTarget = (
  targets: ReadonlyArray<CollectedTarget>,
  identity: TargetIdentity,
) =>
  Arr.findFirst(
    targets,
    (target) =>
      new TargetIdentity({ kind: target.kind, name: target.name }).toKey() ===
      identity.toKey(),
  );

const ensureTargetModule = (
  targets: Array<CollectedTarget>,
  identity: TargetIdentity,
  moduleId: ModuleId,
) => {
  const existing = findTarget(targets, identity);

  if (Option.isNone(existing)) {
    targets.push({
      kind: identity.kind,
      name: identity.name,
      modules: [moduleId],
      confirmed: false,
    });
    return true;
  }
  if (existing.value.modules.includes(moduleId)) return false;
  existing.value.modules.push(moduleId);
  existing.value.confirmed = false;
  return true;
};

const supportedModulesForTarget = (
  identity: TargetIdentity,
  moduleIds: ReadonlyArray<ModuleId>,
) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogReader;

    return yield* Effect.filter(moduleIds, (moduleId) =>
      catalog.isSupportedOn(moduleId, identity),
    );
  });

// A dependency on the same non-package kind stays on the dependent's own target.
const dependencyTargetFor = (
  dependent: TargetIdentity,
  dependency: TargetIdentity,
) =>
  dependency.kind !== "package" && dependency.kind === dependent.kind
    ? dependent
    : dependency;

/**
 * Follow required-module dependencies without adding them to Selection.
 * Blueprint remains responsible for materializing the dependency closure; the
 * interactive command only needs this view to discover provider choices.
 */
const collectRequiredModuleClosure = (
  targets: ReadonlyArray<CollectedTarget>,
) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogReader;
    const visitedRef = yield* Ref.make<ReadonlySet<string>>(new Set());
    const reachableRef = yield* Ref.make<
      ReadonlyArray<{ target: TargetIdentity; moduleId: ModuleId }>
    >([]);

    const visit = (
      target: TargetIdentity,
      moduleId: ModuleId,
    ): Effect.Effect<void, CatalogNotFound> =>
      Effect.gen(function* () {
        const key = `${target.toKey()}:${moduleId}`;
        const visited = yield* Ref.get(visitedRef);
        if (visited.has(key)) return;

        yield* Ref.update(visitedRef, (current) => new Set([...current, key]));
        yield* Ref.update(reachableRef, (current) => [
          ...current,
          { target, moduleId },
        ]);

        const definition = yield* catalog.getModule(moduleId);
        yield* Effect.forEach(
          definition.dependencies.filter(
            ModuleDependency.guards["required-module"],
          ),
          (dependency) =>
            visit(
              dependencyTargetFor(target, dependency.target),
              dependency.moduleId,
            ),
        );
      });

    yield* Effect.forEach(
      targets.flatMap((target) => {
        const identity = new TargetIdentity({
          kind: target.kind,
          name: target.name,
        });
        return target.modules.map((moduleId) => ({ identity, moduleId }));
      }),
      ({ identity, moduleId }) => visit(identity, moduleId),
    );

    return yield* Ref.get(reachableRef);
  });

const isProvidedBy = Effect.fnUntraced(function* (
  target: Option.Option<CollectedTarget>,
  capability: ModuleCapability,
) {
  if (Option.isNone(target)) return false;
  const catalog = yield* CatalogReader;
  const definitions = yield* Effect.forEach(
    target.value.modules,
    catalog.getModule,
  );
  return definitions.some((definition) =>
    (definition.provides ?? []).includes(capability),
  );
});

type CapabilityNeed = {
  definition: ModuleDefinition;
  target: TargetIdentity;
  dependency: Extract<ModuleDependency, { _tag: "required-capability" }>;
};

const provideCapability = Effect.fnUntraced(function* (
  targets: Array<CollectedTarget>,
  { definition, target, dependency }: CapabilityNeed,
) {
  const catalog = yield* CatalogReader;
  const requiredTarget = dependencyTargetFor(target, dependency.target);

  if (
    yield* isProvidedBy(
      findTarget(targets, requiredTarget),
      dependency.capability,
    )
  ) {
    return false;
  }

  const providers = catalog.getCapabilityProviders({
    capability: dependency.capability,
    target: requiredTarget,
  });
  if (!Arr.isReadonlyArrayNonEmpty(providers)) {
    return yield* Effect.fail(
      `Module "${definition.id}" requires capability "${dependency.capability}" on ${requiredTarget.toKey()}, but no compatible provider module exists.`,
    );
  }

  const providerId =
    providers.length === 1
      ? providers[0].id
      : yield* HorizontalSelect({
          message: `Module "${definition.title}" requires ${dependency.capability}. Which provider should be added to ${requiredTarget.toKey()}?`,
          choices: providers.map((candidate) => ({
            title: candidate.title,
            value: candidate.id,
          })),
        });

  return ensureTargetModule(targets, requiredTarget, providerId);
});

const resolveCapabilities = Effect.fnUntraced(function* (
  targets: Array<CollectedTarget>,
) {
  const catalog = yield* CatalogReader;
  const reachable = yield* Effect.forEach(
    yield* collectRequiredModuleClosure(targets),
    ({ target, moduleId }) =>
      Effect.map(catalog.getModule(moduleId), (definition) => ({
        target,
        definition,
      })),
  );

  const needs = reachable.flatMap(({ target, definition }) =>
    definition.dependencies
      .filter(ModuleDependency.guards["required-capability"])
      .map((dependency) => ({ definition, target, dependency })),
  );

  const provided = yield* Effect.forEach(needs, (need) =>
    provideCapability(targets, need),
  );
  return provided.some(Boolean);
});

const collectTargetsFromSpecs = (
  targetSpecs: ReadonlyArray<RecipeTargetSpec>,
) =>
  Effect.map(parseRecipeTargetSpecs(targetSpecs), (targets) =>
    Arr.map(targets, (target) => ({
      kind: target.target.kind,
      name: target.target.name,
      modules: [...target.modules],
      confirmed: true,
    })),
  );

const isScaffoldAborted = Schema.is(ScaffoldAborted);

const addTarget = Effect.fnUntraced(function* (
  targets: Array<CollectedTarget>,
  targetChoices: ReadonlyArray<{ title: string; value: TargetKind }>,
) {
  const catalog = yield* CatalogReader;
  const kind = yield* HorizontalSelect({
    message: "What kind of target do you want to add?",
    choices: targetChoices,
  });

  const name = yield* TextInput({
    message: `What should this ${kind} target be called?`,
    validate: validateTargetName(kind),
  });

  const availableModules = yield* catalog.getSupportedModules(kind, {
    visibility: "public",
  });

  const moduleTree = yield* buildModuleTree(availableModules);

  const modules = Arr.isReadonlyArrayNonEmpty(moduleTree)
    ? yield* NestedMultiSelect({
        message: `Which modules do you want to add to "${kind}/${name}"?`,
        choices: moduleTree,
      })
    : [];
  const supportedModules = yield* supportedModulesForTarget(
    new TargetIdentity({ kind, name }),
    modules,
  );

  targets.push({
    kind,
    name,
    modules: [...supportedModules],
    confirmed: false,
  });
});

const editTarget = Effect.fnUntraced(function* (
  targets: Array<CollectedTarget>,
) {
  const catalog = yield* CatalogReader;
  const index = yield* Select({
    message: "Which target do you want to edit?",
    choices: targets.map((target, i) => ({
      title: `${target.kind}/${target.name}  [${target.modules.join(", ")}]`,
      value: i,
    })),
  });
  const target = targets[index];
  if (target === undefined) return;

  const availableModules = yield* catalog.getSupportedModules(target.kind, {
    visibility: "public",
  });
  if (!Arr.isReadonlyArrayNonEmpty(availableModules)) {
    target.confirmed = true;
    return;
  }

  const moduleTree = yield* buildModuleTree(availableModules);
  const newModules = yield* NestedMultiSelect({
    message: `Select modules for "${target.kind}/${target.name}":`,
    choices: moduleTree,
    initialSelected: target.modules,
  });
  const supportedModules = yield* supportedModulesForTarget(
    new TargetIdentity({ kind: target.kind, name: target.name }),
    newModules,
  );
  target.modules = [...supportedModules];
  target.confirmed = true;

  // NOTE: Prune implied modules that were invalidated by explicit edits before resolving again.
  yield* removeOrphanedImplications(
    targets,
    new Set(
      supportedModules.map((moduleId) => implicationKey(target.kind, moduleId)),
    ),
  );
  yield* resolveImplicationsInteractive(targets);
});

const confirmAll = Effect.fnUntraced(function* (
  targets: Array<CollectedTarget>,
) {
  if (yield* resolveCapabilities(targets)) return false;
  for (const target of targets) {
    target.confirmed = true;
  }
  return true;
});

const renderTargetPanel = (
  targets: ReadonlyArray<CollectedTarget>,
  terminalWidth: number,
) => {
  const panelContentWidth = Math.max(20, terminalWidth - 4);
  return Box.renderPrettySync(
    Box.vsep(
      [
        Box.text("Current targets and modules:").pipe(Box.annotate(Ansi.bold)),
        formatTargetSummary(targets, panelContentWidth),
      ],
      1,
      Box.left,
    ).pipe(
      Box.maxWidth(panelContentWidth),
      Box.pad(0, 1),
      Box.border("rounded", { annotation: Ansi.dim }),
    ),
  );
};

const collectTargetsInteractive = Effect.gen(function* () {
  const catalog = yield* CatalogReader;
  const terminal = yield* Terminal.Terminal;

  const targetChoices = yield* Effect.forEach(
    catalog.getTargetKinds({ visibility: "public" }),
    (kind) =>
      Effect.map(catalog.getTarget(kind), (target) => ({
        title: target.title,
        value: kind,
      })),
  );

  const targets: Array<CollectedTarget> = [];
  yield* addTarget(targets, targetChoices);

  const [first] = targets;
  if (first !== undefined && Arr.isArrayNonEmpty(first.modules)) {
    first.confirmed = true;
  }

  yield* resolveImplicationsInteractive(targets);

  let allConfirmed = false;
  while (!allConfirmed) {
    yield* Console.log(renderTargetPanel(targets, yield* terminal.columns));

    const action = yield* HorizontalSelect<"confirm-all" | "edit" | "add">({
      message: "What would you like to do?",
      choices: [
        { title: "Confirm all", value: "confirm-all" },
        { title: "Edit modules", value: "edit" },
        { title: "Add target", value: "add" },
      ],
    });

    allConfirmed = yield* Match.value(action).pipe(
      Match.when("confirm-all", () => confirmAll(targets)),
      Match.when("edit", () => Effect.as(editTarget(targets), false)),
      Match.when("add", () =>
        addTarget(targets, targetChoices).pipe(
          Effect.andThen(resolveImplicationsInteractive(targets)),
          Effect.as(false),
        ),
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
    target: recipeTargetFlag,
    catalog: catalogFlag,
    yes: yesFlag,
    dryRun: dryRunFlag,
    showFiles: showFilesFlag,
    trust: trustFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const { confirm, mode } = yield* decodeRunFlags(flags);
      if (
        confirm === "assume-yes" &&
        Option.isNone(flags.target) &&
        wasTargetFlagProvided(process.argv)
      ) {
        return yield* Effect.fail(
          "Missing value for --target. Use --target <targetKind>/<targetName>:<moduleId>[,...] for non-interactive add.",
        );
      }

      const configure = yield* ConfigureService;
      const pipeline = yield* ScaffoldPipeline;
      const recipes = yield* RecipeResolver;

      const repositoryRoot = Option.getOrElse(flags.root, () => process.cwd());

      const config = yield* configure.requireConfig(repositoryRoot);

      const collected = Option.isSome(flags.target)
        ? yield* collectTargetsFromSpecs(flags.target.value)
        : yield* collectTargetsInteractive;

      const selection = yield* recipes.resolve(
        {
          targets: Arr.map(collected, (target) => ({
            target: new TargetIdentity({
              kind: target.kind,
              name: target.name,
            }),
            modules: target.modules,
          })),
        },
        RecipeResolveOptions.make({
          config,
          providerStrategy: { _tag: "fail-on-ambiguous" },
        }),
      );
      const createCommand = recipes.renderCreateCommand({ config, selection });

      yield* pipeline.run(
        { selection, repositoryRoot, config, createCommand },
        mode,
      );
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
      command: "stack-effect add --target server/api:server-http-api",
      description: "Add a specific module to a target",
    },
    {
      command:
        "stack-effect add --yes --target package/domain:domain-api-contracts --dry-run",
      description: "Non-interactive dry run for CI/LLM usage",
    },
  ]),
);
