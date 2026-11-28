import { CatalogReader } from "@repo/catalog/Catalog";
import type {
  CatalogNotFound,
  ModuleCapability,
  ModuleChild,
  ModuleDefinition,
  ModuleId,
  ModuleImplication,
  SupportedRuntime,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  bindModuleDependencyTarget,
  defaultSupportedRuntimes,
  ModuleDependency,
  TargetIdentity,
} from "@repo/domain/Catalog";
import {
  parseRecipeTargetSpecs,
  RecipeResolveOptions,
  type RecipeTargetSpec,
} from "@repo/domain/Recipe";
import { BlueprintResolver } from "@repo/scaffold/Blueprint";
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
  target: TargetIdentity,
): Effect.Effect<NestedModuleChild<ModuleId>, CatalogNotFound, CatalogReader> =>
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
        buildChild(ref, visitedRef, target),
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
  target: TargetIdentity,
) {
  const catalog = yield* CatalogReader;
  const child = yield* Effect.option(catalog.getModule(ref.moduleId));
  if (
    Option.isNone(child) ||
    (yield* Ref.get(visitedRef)).has(child.value.id) ||
    (ref.requirement === "optional" &&
      !(yield* catalog.isSupportedOn(child.value.id, target)))
  ) {
    return Option.none();
  }
  return Option.some(
    yield* buildNode(child.value, ref.requirement, visitedRef, target),
  );
});

const buildRoot = Effect.fnUntraced(function* (
  mod: ModuleDefinition,
  target: TargetIdentity,
) {
  const visitedRef = yield* Ref.make<ReadonlySet<string>>(new Set());
  return (yield* buildNode(mod, "required", visitedRef, target)).node;
});

/**
 * Build the nested module picker from catalog dependency metadata. Cross-target
 * children are shown for visibility, but Selection construction routes each
 * chosen module back to its owning target.
 */
const buildModuleTree = Effect.fnUntraced(function* (
  modules: ReadonlyArray<ModuleDefinition>,
  target: TargetIdentity,
) {
  const catalog = yield* CatalogReader;
  const childModuleIds = new Set(
    modules.flatMap((mod) =>
      (mod.children ?? []).map((child) => child.moduleId),
    ),
  );
  const roots = yield* Effect.filter(
    modules.filter((mod) => !childModuleIds.has(mod.id)),
    (mod) => catalog.isSupportedOn(mod.id, target),
  );
  return yield* Effect.forEach(roots, (mod) => buildRoot(mod, target));
});

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

const placeImplicationsOf = Effect.fnUntraced(function* (
  targets: Array<CollectedTarget>,
  moduleId: ModuleId,
) {
  const definition = yield* (yield* CatalogReader).getModule(moduleId);
  return yield* Effect.forEach(definition.implies ?? [], (implication) =>
    placeImplication(targets, definition, implication),
  );
});

// An implied module may live on another target kind; place it there, adding the target if needed.
const resolveImplications = Effect.fnUntraced(function* (
  targets: Array<CollectedTarget>,
) {
  // NOTE: BlueprintResolver resolves required-module deps; this prompt only places implied modules.
  // Walk the live arrays: a module placed during this pass is visited in
  // target order, so the first requester of a shared module asks where it goes.
  const placed = yield* Effect.forEach(targets, (target) =>
    Effect.forEach(target.modules, (moduleId) =>
      placeImplicationsOf(targets, moduleId),
    ),
  );
  return placed.flat(2).some(Boolean);
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
  defaultName?: string,
) =>
  Arr.findFirst(targets, (target) =>
    new TargetIdentity({
      kind: target.kind,
      name: target.name,
    }).matchesReference(identity, defaultName),
  );

const ensureTargetModule = (
  targets: Array<CollectedTarget>,
  identity: TargetIdentity,
  moduleId: ModuleId,
  defaultName?: string,
) => {
  const existing = findTarget(targets, identity, defaultName);

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

const pickTargetModules = Effect.fnUntraced(function* (
  identity: TargetIdentity,
  message: string,
  initialSelected: ReadonlyArray<ModuleId> = [],
) {
  const catalog = yield* CatalogReader;
  const target = identity.withDefaultName(
    (yield* catalog.getTarget(identity.kind)).defaultName,
  );
  const available = yield* catalog.getSupportedModules(target.kind, {
    visibility: "public",
  });
  const choices = yield* buildModuleTree(available, target);
  if (!Arr.isReadonlyArrayNonEmpty(choices)) return Option.none();
  const modules = yield* NestedMultiSelect({
    message,
    choices,
    initialSelected,
  });
  return Option.some(
    yield* Effect.filter(modules, (moduleId) =>
      catalog.isSupportedOn(moduleId, target),
    ),
  );
});

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
        const { defaultName } = yield* catalog.getTarget(target.kind);
        const owner = target.withDefaultName(defaultName);
        const key = `${owner.toKey()}#${moduleId}`;
        const visited = yield* Ref.get(visitedRef);
        if (visited.has(key)) return;

        yield* Ref.update(visitedRef, (current) => new Set([...current, key]));
        yield* Ref.update(reachableRef, (current) => [
          ...current,
          { target: owner, moduleId },
        ]);

        const definition = yield* catalog.getModule(moduleId);
        yield* Effect.forEach(
          definition.dependencies.filter(
            ModuleDependency.guards["required-module"],
          ),
          (dependency) =>
            visit(
              bindModuleDependencyTarget(owner, dependency.target),
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
  const requiredTarget = bindModuleDependencyTarget(target, dependency.target);
  const { defaultName } = yield* catalog.getTarget(requiredTarget.kind);
  const owner = requiredTarget.withDefaultName(defaultName);
  const existing = findTarget(targets, owner, defaultName);
  if (yield* isProvidedBy(existing, dependency.capability)) return false;

  const providers = catalog.getCapabilityProviders({
    capability: dependency.capability,
    target: owner,
  });
  if (!Arr.isReadonlyArrayNonEmpty(providers)) {
    return yield* Effect.fail(
      `Module "${definition.id}" requires capability "${dependency.capability}" on ${owner.toKey()}, but no compatible provider module exists.`,
    );
  }

  const providerId =
    providers.length === 1
      ? providers[0].id
      : yield* HorizontalSelect({
          message: `Module "${definition.title}" requires ${dependency.capability}. Which provider should be added to ${owner.toKey()}?`,
          choices: providers.map((candidate) => ({
            title: candidate.title,
            value: candidate.id,
          })),
        });

  return ensureTargetModule(targets, owner, providerId, defaultName);
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
  const kind = yield* HorizontalSelect({
    message: "What kind of target do you want to add?",
    choices: targetChoices,
  });

  const name = yield* TextInput({
    message: `What should this ${kind} target be called?`,
    validate: validateTargetName(kind),
  });

  const modules = yield* pickTargetModules(
    new TargetIdentity({ kind, name }),
    `Which modules do you want to add to "${kind}/${name}"?`,
  );

  targets.push({
    kind,
    name,
    modules: [...Option.getOrElse(modules, () => [])],
    confirmed: false,
  });
});

const editTarget = Effect.fnUntraced(function* (
  targets: Array<CollectedTarget>,
) {
  const index = yield* Select({
    message: "Which target do you want to edit?",
    choices: targets.map((target, i) => ({
      title: `${target.kind}/${target.name}  [${target.modules.join(", ")}]`,
      value: i,
    })),
  });
  const target = targets[index];
  if (target === undefined) return;

  const modules = yield* pickTargetModules(
    new TargetIdentity({ kind: target.kind, name: target.name }),
    `Select modules for "${target.kind}/${target.name}":`,
    target.modules,
  );
  target.confirmed = true;
  if (Option.isNone(modules)) return;
  target.modules = [...modules.value];

  // NOTE: Prune implied modules that were invalidated by explicit edits before resolving again.
  yield* removeOrphanedImplications(
    targets,
    new Set(
      modules.value.map((moduleId) => implicationKey(target.kind, moduleId)),
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

const collectTargetsInteractive = Effect.fnUntraced(function* (
  runtime: SupportedRuntime,
) {
  const catalog = yield* CatalogReader;
  const terminal = yield* Terminal.Terminal;

  const definitions = yield* Effect.forEach(
    catalog.getTargetKinds({ visibility: "public" }),
    catalog.getTarget,
  );
  const targetChoices = definitions
    .filter((target) =>
      (target.supportedRuntimes ?? defaultSupportedRuntimes).includes(runtime),
    )
    .map((target) => ({ title: target.title, value: target.kind }));

  if (targetChoices.length === 0) {
    return yield* Effect.fail(
      `The selected catalogs have no application targets for ${runtime}.`,
    );
  }

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
        : yield* collectTargetsInteractive(config.runtimeName);

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
      const blueprints = yield* BlueprintResolver;
      const blueprint = yield* blueprints.resolve(selection, config);
      const createCommand = recipes.renderCreateCommand({ config, selection });

      yield* pipeline.run(
        { selection, blueprint, repositoryRoot, config, createCommand },
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
