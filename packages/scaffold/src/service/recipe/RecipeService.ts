import { CatalogService } from "@repo/catalog";
import {
  GenerationDomainId,
  GenerationDomainOptionId,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import type { RecipeSpec, RecipeTargetSpec } from "@repo/domain/Recipe";
import { StackConfig } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import { Array as Arr, Context, Effect, Layer, Option, pipe } from "effect";
import {
  InvalidRecipeSpec,
  type RecipeError,
  type RecipeResolveOptions,
} from "./RecipeErrors";
import { encodeRecipeTargetSpecs } from "./RecipeTargets";
import { StackConfigDefaults } from "./StackConfigDefaults";
import { toTypeScriptModuleId, toWorkspaceModuleId } from "./WorkspaceModules";

export {
  AmbiguousRecipeProvider,
  InvalidRecipeSpec,
  MissingRecipeProvider,
  type RecipeError,
  RecipeProviderStrategy,
  RecipeResolveOptions,
  UnresolvedRecipeTarget,
} from "./RecipeErrors";

interface RecipeServiceShape {
  readonly resolve: (
    spec: RecipeSpec,
    options: RecipeResolveOptions,
  ) => Effect.Effect<typeof Selection.Type, RecipeError, never>;
  readonly renderCreateCommand: (options: {
    readonly config: typeof StackConfig.Type;
    readonly selection: typeof Selection.Type;
  }) => string;
}

type CollectedRecipeTarget = {
  readonly identity: TargetIdentity;
  readonly modules: ReadonlyArray<typeof ModuleId.Type>;
};

const quoteShellArg = (value: string) =>
  /^[A-Za-z0-9_./:,@+-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;

const configPackageManager = (
  runtime: (typeof StackConfig.Type)["runtime"],
): "bun" | "pnpm" | "npm" =>
  runtime._tag === "bun" ? "bun" : runtime.packageManager;

const configWorkspaceModules = (
  config: typeof StackConfig.Type,
): ReadonlyArray<typeof ModuleId.Type> =>
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

const resolveTargetIdentity = (
  catalog: typeof CatalogService.Service,
  config: typeof StackConfig.Type,
  identity: TargetIdentity,
) =>
  Effect.gen(function* () {
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

const mergeTargets = (
  targets: ReadonlyArray<CollectedRecipeTarget>,
): ReadonlyArray<CollectedRecipeTarget> =>
  Arr.reduce(targets, [] as Array<CollectedRecipeTarget>, (merged, target) => {
    const existing = Arr.findFirst(
      merged,
      (candidate) => candidate.identity.toKey() === target.identity.toKey(),
    );

    if (Option.isNone(existing)) {
      return [
        ...merged,
        {
          identity: target.identity,
          modules: Arr.dedupe(target.modules),
        },
      ];
    }

    return Arr.map(merged, (candidate) =>
      candidate.identity.toKey() === target.identity.toKey()
        ? {
            identity: candidate.identity,
            modules: Arr.dedupe([...candidate.modules, ...target.modules]),
          }
        : candidate,
    );
  });

const toSelection = (
  targets: ReadonlyArray<CollectedRecipeTarget>,
): typeof Selection.Type => ({
  targets: Arr.map(targets, (target) => ({
    identity: target.identity,
    modules: Arr.map(target.modules, (id) => ({ id })),
  })),
});

const selectionTargetToRecipeTargetSpec = (
  target: (typeof Selection.Type)["targets"][number],
): RecipeTargetSpec => ({
  target: target.identity,
  modules: Arr.map(target.modules, (moduleSelection) => moduleSelection.id),
});

const selectionIncludesWorkspaceModule = (
  selection: typeof Selection.Type,
  moduleId: string,
) =>
  Arr.some(
    selection.targets,
    (target) =>
      target.identity.kind === "workspace" &&
      Arr.some(
        target.modules,
        (moduleSelection) => moduleSelection.id === moduleId,
      ),
  );

const renderChangedFlag = (
  flag: string,
  value: string | undefined,
  defaultValue: string,
) =>
  value === undefined || value === defaultValue
    ? []
    : [flag, quoteShellArg(value)];

export class RecipeService extends Context.Service<
  RecipeService,
  RecipeServiceShape
>()("RecipeService") {
  static readonly make = Effect.gen(function* () {
    const catalog = yield* CatalogService;
    const defaults = yield* StackConfigDefaults;

    const resolve: RecipeServiceShape["resolve"] = Effect.fn(
      "RecipeService.resolve",
    )(function* (recipe, options) {
      const recipeTargets = yield* Effect.forEach(recipe.targets, (target) =>
        Effect.gen(function* () {
          const identity = yield* resolveTargetIdentity(
            catalog,
            options.config,
            target.target,
          );
          return { identity, modules: target.modules };
        }),
      );

      const selection = toSelection(
        mergeTargets([
          {
            identity: new TargetIdentity({
              kind: TargetKind.make("workspace"),
              name: options.config.name,
            }),
            modules: configWorkspaceModules(options.config),
          },
          ...recipeTargets,
        ]),
      );
      return options.config.effectiveInfrastructure === "cloudflare"
        ? {
            ...selection,
            domains: [
              {
                id: GenerationDomainId.make("infrastructure"),
                option: GenerationDomainOptionId.make("cloudflare"),
              },
            ],
          }
        : selection;
    });

    const renderCreateCommand: RecipeServiceShape["renderCreateCommand"] = ({
      config,
      selection,
    }) => {
      const commandRunner = config.runtime._tag === "bun" ? "bunx" : "npx";
      const packageManager = configPackageManager(config.runtime);
      const configModuleIds = new Set(configWorkspaceModules(config));
      const targetFlags = pipe(
        selection.targets,
        Arr.flatMap((target) => {
          if (target.identity.kind !== "workspace") {
            return [selectionTargetToRecipeTargetSpec(target)];
          }
          const modules = Arr.filter(
            target.modules,
            (module) =>
              !configModuleIds.has(module.id) &&
              module.id !== "workspace-devenv-git",
          );
          return modules.length === 0
            ? []
            : [
                {
                  target: target.identity,
                  modules: Arr.map(modules, (module) => module.id),
                },
              ];
        }),
        encodeRecipeTargetSpecs,
        Arr.flatMap((target) => ["--target", quoteShellArg(target)]),
      );

      return [
        commandRunner,
        "stack-effect@latest",
        "create",
        quoteShellArg(config.name),
        ...targetFlags,
        ...(config.runtime._tag === defaults.runtime._tag
          ? []
          : ["--runtime", "node"]),
        ...(packageManager === defaults.packageManagerName
          ? []
          : ["--package-manager", packageManager]),
        ...renderChangedFlag(
          "--typescript",
          config.typescriptVersion,
          defaults.typescriptVersion,
        ),
        ...renderChangedFlag(
          "--monorepo",
          config.monorepo,
          defaults.monorepo ?? "",
        ),
        ...renderChangedFlag("--lint", config.lint, defaults.lint ?? ""),
        ...renderChangedFlag("--format", config.format, defaults.format ?? ""),
        ...renderChangedFlag("--test", config.test, defaults.test ?? ""),
        ...(selectionIncludesWorkspaceModule(selection, "workspace-devenv-git")
          ? []
          : ["--no-git"]),
      ].join(" ");
    };

    return {
      resolve,
      renderCreateCommand,
    } satisfies RecipeServiceShape;
  });

  static readonly layer = Layer.effect(this, this.make);
}
