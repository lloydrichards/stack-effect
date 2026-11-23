import { CatalogService } from "@repo/catalog";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import {
  InvalidRecipeSpec,
  type RecipeResolveOptions,
  type RecipeSpec,
  type RecipeTargetSpec,
} from "@repo/domain/Recipe";
import { StackConfig } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import { Array as Arr, Effect, Option } from "effect";
import type { RecipeService } from "../RecipeService";
import {
  encodeRecipeTargetSpecs,
  mergeRecipeTargets,
  type ParsedRecipeTarget,
} from "../RecipeTargets";
import {
  defaultsForRuntime,
  StackConfigDefaults,
} from "../StackConfigDefaults";
import { toTypeScriptModuleId, toWorkspaceModuleId } from "../WorkspaceModules";

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
  catalog: CatalogService["Service"],
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
  const catalog = yield* CatalogService;
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

  const resolve = Effect.fn("RecipeService.resolve")(function* (
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

    return toSelection(
      mergeRecipeTargets(
        targets.map(({ target, modules }) => ({
          target: firstIdentities.get(target.toKey()) ?? target,
          modules,
        })),
      ),
    );
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

  return { resolve, renderCreateCommand } satisfies RecipeService["Service"];
});
