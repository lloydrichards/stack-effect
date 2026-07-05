import { CatalogService } from "@repo/catalog";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import type { RecipeSpec } from "@repo/domain/Recipe";
import { StackConfig } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import { Array as Arr, Context, Effect, Layer, Option } from "effect";
import { toWorkspaceModuleId } from "../lib/workspace";
import {
  AmbiguousRecipeProvider,
  InvalidRecipeSpec,
  MissingRecipeProvider,
  type RecipeError,
  type RecipeResolveOptions,
  UnresolvedRecipeTarget,
} from "./RecipeErrors";

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
}

type CollectedRecipeTarget = {
  readonly identity: TargetIdentity;
  readonly modules: ReadonlyArray<typeof ModuleId.Type>;
};

const configWorkspaceModules = (
  config: typeof StackConfig.Type,
): ReadonlyArray<typeof ModuleId.Type> =>
  Arr.dedupe(
    [config.monorepo, config.lint, config.format, config.test].flatMap(
      (moduleId) =>
        moduleId === undefined
          ? []
          : [ModuleId.make(toWorkspaceModuleId(moduleId))],
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

    if (identity.name.length > 0) return identity;

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

export class RecipeService extends Context.Service<
  RecipeService,
  RecipeServiceShape
>()("RecipeService") {
  static readonly make = Effect.gen(function* () {
    const catalog = yield* CatalogService;

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

      return toSelection(
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
    });

    return {
      resolve,
    } satisfies RecipeServiceShape;
  });

  static readonly layer = Layer.effect(this, this.make);
}
