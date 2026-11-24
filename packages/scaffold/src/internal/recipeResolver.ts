import { CatalogReader } from "@repo/catalog/Catalog";
import {
  type ModuleCapability,
  type ModuleDefinition,
  ModuleId,
  type SupportedRuntime,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  AmbiguousRecipeProvider,
  encodeRecipeTargetSpecs,
  InvalidRecipeProvider,
  InvalidRecipeSpec,
  mergeRecipeTargets,
  MissingRecipeProvider,
  type ParsedRecipeTarget,
  type RecipeProviderStrategy,
  type RecipeResolveOptions,
  type RecipeSpec,
  type RecipeTargetSpec,
} from "@repo/domain/Recipe";
import type { Selection } from "@repo/domain/Selection";
import {
  defaultsForRuntime,
  StackConfig,
  StackConfigDefaults,
  toTypeScriptModuleId,
  toWorkspaceModuleId,
} from "@repo/domain/StackConfig";
import { Array as Arr, Effect, Option } from "effect";
import type { RecipeResolver } from "../Recipe";

// Matches the runtimes Blueprint assumes for a definition that names none.
const DEFAULT_SUPPORTED_RUNTIMES: ReadonlyArray<SupportedRuntime> = [
  "bun",
  "node",
];

const quoteShellArg = (value: string) =>
  /^[A-Za-z0-9_./:,@+-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;

const configPackageManager = (
  runtime: StackConfig["runtime"],
): "bun" | "deno" | "pnpm" | "npm" =>
  runtime._tag === "node" ? runtime.packageManager : runtime._tag;

const customWorkspaceModules = (config: StackConfig) =>
  Arr.dedupe(
    [
      ["tool", config.monorepo],
      ["lint", config.lint],
      ["format", config.format],
      ["tool", config.test],
    ].flatMap(([category, tool]) =>
      tool === undefined || tool === ""
        ? []
        : [
            ModuleId.make(
              toWorkspaceModuleId(category as "lint" | "format" | "tool", tool),
            ),
          ],
    ),
  );

const officialWorkspaceModules = (
  config: StackConfig,
): ReadonlyArray<ModuleId> =>
  Arr.dedupe(
    [
      toWorkspaceModuleId(
        "tool",
        toTypeScriptModuleId(config.typescriptVersion),
      ),
      config.monorepo === undefined
        ? undefined
        : toWorkspaceModuleId("tool", config.monorepo),
      config.lint === undefined
        ? undefined
        : toWorkspaceModuleId("lint", config.lint),
      config.format === undefined
        ? undefined
        : toWorkspaceModuleId("format", config.format),
      config.test === undefined
        ? undefined
        : toWorkspaceModuleId("tool", config.test),
    ].flatMap((moduleId) =>
      moduleId === undefined ? [] : [ModuleId.make(moduleId)],
    ),
  );

// Without the official source, only tools the user named become modules.
const configWorkspaceModules = (config: StackConfig): ReadonlyArray<ModuleId> =>
  config.usesOfficialCatalog
    ? officialWorkspaceModules(config)
    : customWorkspaceModules(config);

const resolveTargetIdentity = Effect.fnUntraced(function* (
  catalog: CatalogReader["Service"],
  config: StackConfig,
  identity: TargetIdentity,
) {
  if (identity.kind === "workspace") {
    return new TargetIdentity({
      kind: TargetKind.make("workspace"),
      name: config.name,
    });
  }

  if (identity.hasExplicitName()) return identity;

  const targetDefinition = yield* catalog.getTarget(identity.kind).pipe(
    Effect.mapError(
      () =>
        new InvalidRecipeSpec({
          issues: [
            {
              path: ["targets", "target", "kind"],
              message: `Unknown target kind "${identity.kind}".`,
            },
          ],
        }),
    ),
  );
  const defaultName = Option.fromNullishOr(targetDefinition.defaultName);

  if (Option.isSome(defaultName)) {
    return new TargetIdentity({
      kind: identity.kind,
      name: defaultName.value,
    });
  }

  return yield* new InvalidRecipeSpec({
    issues: [
      {
        path: ["targets", "target", "name"],
        message: `Target kind "${identity.kind}" does not define a default name. Provide an explicit target name.`,
      },
    ],
  });
});

// Mirrors Blueprint: a non-package dependency on the requester's own kind
// means the requester's target.
const dependencyTargetOf = (
  requester: TargetIdentity,
  dependencyTarget: TargetIdentity,
) =>
  dependencyTarget.kind !== "package" &&
  dependencyTarget.kind === requester.kind
    ? requester
    : dependencyTarget;

const supportsRuntime = (definition: ModuleDefinition, config: StackConfig) =>
  (definition.supportedRuntimes ?? DEFAULT_SUPPORTED_RUNTIMES).includes(
    config.runtimeName,
  );

type ProviderRequirement = {
  readonly requestingModuleId: ModuleId;
  readonly target: TargetIdentity;
  readonly capability: ModuleCapability;
};

const toProviderCandidates = (candidates: ReadonlyArray<ModuleDefinition>) =>
  candidates.map(({ id, title, description }) => ({
    moduleId: id,
    title,
    description,
  }));

const chooseProvider = Effect.fnUntraced(function* (
  strategy: RecipeProviderStrategy,
  requirement: ProviderRequirement,
  candidates: ReadonlyArray<ModuleDefinition>,
) {
  const [first, ...others] = candidates;
  if (first === undefined) {
    return yield* new MissingRecipeProvider(requirement);
  }

  const named =
    strategy._tag === "explicit"
      ? strategy.providers.find(
          (provider) =>
            provider.target.toKey() === requirement.target.toKey() &&
            provider.capability === requirement.capability,
        )
      : undefined;
  if (named !== undefined) {
    if (candidates.some(({ id }) => id === named.moduleId)) {
      return named.moduleId;
    }
    return yield* new InvalidRecipeProvider({
      ...requirement,
      moduleId: named.moduleId,
      providers: toProviderCandidates(candidates),
    });
  }

  if (others.length === 0 || strategy._tag === "first-provider") {
    return first.id;
  }

  return yield* new AmbiguousRecipeProvider({
    ...requirement,
    providers: toProviderCandidates(candidates),
  });
});

const toSelection = (
  targets: ReadonlyArray<ParsedRecipeTarget>,
): Selection => ({
  targets: targets.map((target) => ({
    identity: target.target,
    modules: target.modules.map((id) => ({ id })),
  })),
});

const selectionTargetToRecipeTargetSpec = (
  target: Selection["targets"][number],
): RecipeTargetSpec => ({
  target: target.identity,
  modules: target.modules.map((moduleSelection) => moduleSelection.id),
});

const selectionIncludesWorkspaceModule = (
  selection: Selection,
  moduleId: string,
) =>
  selection.targets.some(
    (target) =>
      target.identity.kind === "workspace" &&
      target.modules.some((moduleSelection) => moduleSelection.id === moduleId),
  );

const renderChangedFlag = (
  flag: string,
  value: string | undefined,
  defaultValue: string,
) =>
  value === undefined || value === defaultValue
    ? []
    : [flag, quoteShellArg(value)];

/** @internal */
export const make = Effect.gen(function* () {
  const catalog = yield* CatalogReader;
  const defaults = yield* StackConfigDefaults;

  const requireCustomWorkspace = Effect.fnUntraced(function* (
    config: StackConfig,
  ) {
    if (config.usesOfficialCatalog) return;
    const hasWorkspace = yield* catalog
      .getTarget(TargetKind.make("workspace"))
      .pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      );
    const missingModules = yield* Effect.filter(
      customWorkspaceModules(config),
      (id) =>
        catalog.getModule(id).pipe(
          Effect.as(false),
          Effect.orElseSucceed(() => true),
        ),
    );
    const issues = [
      ...(hasWorkspace
        ? []
        : [
            {
              path: ["catalogs"],
              message: `The selected catalogs (${config.catalogSources.map((source) => source.name).join(", ")}) provide no workspace target.`,
            },
          ]),
      ...missingModules.map((id) => ({
        path: ["config"],
        message: `Workspace tool module "${id}" is not provided by the selected catalogs.`,
      })),
    ];
    if (issues.length > 0) return yield* new InvalidRecipeSpec({ issues });
  });

  const findModule = (moduleId: ModuleId) =>
    catalog.getModule(moduleId).pipe(Effect.option);

  const targetRequiredModules = (identity: TargetIdentity) =>
    catalog.getTarget(identity.kind).pipe(
      Effect.map((definition) => definition.requiredModules ?? []),
      Effect.orElseSucceed((): ReadonlyArray<ModuleId> => []),
    );

  const providesCapability = (
    moduleId: ModuleId,
    capability: ModuleCapability,
  ) =>
    findModule(moduleId).pipe(
      Effect.map((definition) =>
        Option.exists(definition, ({ provides }) =>
          (provides ?? []).includes(capability),
        ),
      ),
    );

  // Adds a provider for each required capability the recipe leaves unmet,
  // walking the modules Blueprint would attach until nothing changes. Unknown
  // modules and targets are skipped here so Blueprint reports them.
  const addCapabilityProviders = Effect.fnUntraced(function* (
    targets: ReadonlyArray<ParsedRecipeTarget>,
    options: RecipeResolveOptions,
  ) {
    const selected = targets.map(({ target, modules }) => ({
      target,
      modules: [...modules],
    }));
    const findSelected = (identity: TargetIdentity) =>
      selected.find(({ target }) => target.toKey() === identity.toKey());

    // Each target's modules Blueprint attaches, in the order the walk reaches them.
    const attached = new Map<string, Array<ModuleId>>();
    const pending: Array<{ target: TargetIdentity; moduleId: ModuleId }> = [];
    const requirements: Array<ProviderRequirement> = [];
    const enqueueTarget = Effect.fnUntraced(function* (
      target: TargetIdentity,
      modules: ReadonlyArray<ModuleId>,
    ) {
      for (const moduleId of [
        ...modules,
        ...(yield* targetRequiredModules(target)),
      ]) {
        pending.push({ target, moduleId });
      }
    });
    for (const { target, modules } of selected) {
      yield* enqueueTarget(target, modules);
    }

    const selectProvider = Effect.fnUntraced(function* (
      target: TargetIdentity,
      providerId: ModuleId,
    ) {
      const dependencyTarget = findSelected(target);
      if (dependencyTarget === undefined) {
        // Blueprint looks the provider up under the dependency's own key.
        selected.push({ target, modules: [providerId] });
        yield* enqueueTarget(target, [providerId]);
      } else if (!dependencyTarget.modules.includes(providerId)) {
        dependencyTarget.modules.push(providerId);
        pending.push({ target, moduleId: providerId });
      }
    });

    // Follows hard dependencies only; capability requirements wait until every
    // module Blueprint attaches so far is known.
    const visitPending = Effect.fnUntraced(function* () {
      for (
        let next = pending.shift();
        next !== undefined;
        next = pending.shift()
      ) {
        const targetKey = next.target.toKey();
        const attachedOnTarget = attached.get(targetKey) ?? [];
        if (attachedOnTarget.includes(next.moduleId)) continue;
        attached.set(targetKey, [...attachedOnTarget, next.moduleId]);

        const definition = yield* findModule(next.moduleId);
        if (Option.isNone(definition)) continue;

        for (const dependency of definition.value.dependencies) {
          if (dependency._tag === "required-module") {
            pending.push({
              target: dependencyTargetOf(next.target, dependency.target),
              moduleId: dependency.moduleId,
            });
          } else if (dependency._tag === "required-capability") {
            requirements.push({
              requestingModuleId: next.moduleId,
              target: dependencyTargetOf(next.target, dependency.target),
              capability: dependency.capability,
            });
          }
        }
      }
    });

    yield* visitPending();
    for (
      let requirement = requirements.shift();
      requirement !== undefined;
      requirement = requirements.shift()
    ) {
      const { capability, target } = requirement;

      // Several selected providers stay for Blueprint to reject.
      const selectedProviders = yield* Effect.filter(
        findSelected(target)?.modules ?? [],
        (moduleId) => providesCapability(moduleId, capability),
      );
      if (selectedProviders.length > 0) continue;

      // Blueprint finds providers in the Selection, so a hard dependency that
      // already provides the capability is written there.
      const hardProvider = yield* Effect.findFirst(
        attached.get(target.toKey()) ?? [],
        (moduleId) => providesCapability(moduleId, capability),
      );
      const providerId = Option.isSome(hardProvider)
        ? hardProvider.value
        : yield* chooseProvider(
            options.providerStrategy,
            requirement,
            catalog
              .getCapabilityProviders({
                capability,
                target,
                requestingModuleId: requirement.requestingModuleId,
              })
              .filter((candidate) =>
                supportsRuntime(candidate, options.config),
              ),
          );

      yield* selectProvider(target, providerId);
      yield* visitPending();
    }

    return selected;
  });

  const resolve = Effect.fn("RecipeResolver.resolve")(function* (
    recipe: RecipeSpec,
    options: RecipeResolveOptions,
  ) {
    yield* requireCustomWorkspace(options.config);

    const recipeTargets: Array<ParsedRecipeTarget> = [];
    for (const target of recipe.targets) {
      const identity = yield* resolveTargetIdentity(
        catalog,
        options.config,
        target.target,
      );
      recipeTargets.push({ target: identity, modules: target.modules });
    }

    const targets = [
      {
        target: new TargetIdentity({
          kind: TargetKind.make("workspace"),
          name: options.config.name,
        }),
        modules: configWorkspaceModules(options.config),
      },
      ...recipeTargets,
    ];

    // A recipe keeps the first identity it names for each target key.
    const firstIdentities = new Map<string, TargetIdentity>();
    for (const { target } of targets) {
      if (!firstIdentities.has(target.toKey())) {
        firstIdentities.set(target.toKey(), target);
      }
    }

    const merged = mergeRecipeTargets(
      targets.map(({ target, modules }) => ({
        target: firstIdentities.get(target.toKey()) ?? target,
        modules,
      })),
    );

    return toSelection(yield* addCapabilityProviders(merged, options));
  });

  const renderCreateCommand = ({
    config,
    selection,
  }: {
    readonly config: StackConfig;
    readonly selection: Selection;
  }) => {
    const commandRunner =
      config.runtime._tag === "bun"
        ? "bunx"
        : config.runtime._tag === "deno"
          ? "deno run -A npm:"
          : "npx";
    const packageManager = configPackageManager(config.runtime);
    const official = config.usesOfficialCatalog;
    // Custom-only configs compare tools against no defaults, so every named tool renders.
    const runtimeDefaults = official
      ? defaultsForRuntime(defaults, config.runtime._tag)
      : {
          ...defaultsForRuntime(defaults, config.runtime._tag),
          monorepo: undefined,
          lint: undefined,
          format: undefined,
          test: undefined,
        };
    const configModuleIds = new Set(configWorkspaceModules(config));
    const targetSpecs = selection.targets.flatMap(
      (target): Array<RecipeTargetSpec> => {
        if (target.identity.kind !== "workspace") {
          return [selectionTargetToRecipeTargetSpec(target)];
        }
        const modules = target.modules.filter(
          (module) =>
            !configModuleIds.has(module.id) &&
            module.id !== "workspace-devenv-git",
        );
        return modules.length === 0
          ? []
          : [
              {
                target: target.identity,
                modules: modules.map((module) => module.id),
              },
            ];
      },
    );
    const targetFlags = encodeRecipeTargetSpecs(targetSpecs).flatMap(
      (target) => ["--target", quoteShellArg(target)],
    );

    return [
      commandRunner === "deno run -A npm:"
        ? "deno run -A npm:stack-effect@latest"
        : commandRunner,
      ...(commandRunner === "deno run -A npm:" ? [] : ["stack-effect@latest"]),
      "create",
      quoteShellArg(config.name),
      ...(config.catalogs ?? []).flatMap((source) => [
        "--catalog",
        quoteShellArg(
          "url" in source ? `${source.name}=${source.url}` : source.name,
        ),
      ]),
      ...targetFlags,
      ...(config.runtime._tag === defaults.runtime._tag
        ? []
        : ["--runtime", config.runtime._tag]),
      ...(packageManager === defaults.packageManagerName
        ? []
        : ["--package-manager", packageManager]),
      ...renderChangedFlag(
        "--typescript",
        config.typescriptVersion,
        runtimeDefaults.typescript,
      ),
      ...renderChangedFlag(
        "--monorepo",
        config.monorepo,
        runtimeDefaults.monorepo ?? "",
      ),
      ...renderChangedFlag("--lint", config.lint, runtimeDefaults.lint ?? ""),
      ...renderChangedFlag(
        "--format",
        config.format,
        runtimeDefaults.format ?? "",
      ),
      ...renderChangedFlag("--test", config.test, runtimeDefaults.test ?? ""),
      ...(!official ||
      selectionIncludesWorkspaceModule(selection, "workspace-devenv-git")
        ? []
        : ["--no-git"]),
    ].join(" ");
  };

  return { resolve, renderCreateCommand } satisfies RecipeResolver["Service"];
});
