import { CatalogService } from "@repo/catalog";
import { type Blueprint, BlueprintNode } from "@repo/domain/Blueprint";
import { Contribution } from "@repo/domain/Catalog";
import {
  ContributionTokenContext,
  ModuleContribution,
  NormalizedContributions,
  type StackConfig,
  TargetContribution,
} from "@repo/domain/Scaffold";
import { Array as Arr, Context, Effect, Layer, Option } from "effect";
import { RecipeService } from "../recipe/RecipeService";

export class ContributionResolver extends Context.Service<ContributionResolver>()(
  "ContributionResolver",
  {
    make: Effect.gen(function* () {
      const catalog = yield* CatalogService;
      const recipes = yield* RecipeService;

      const resolve = Effect.fn("ContributionResolver.resolve")(function* (
        blueprint: Blueprint,
        config: StackConfig,
      ) {
        const targets = Arr.filter(
          blueprint.nodes,
          BlueprintNode.guards.target,
        );
        const modules = Arr.filter(
          blueprint.nodes,
          BlueprintNode.guards["attached-module"],
        );
        const definitions = yield* Effect.forEach(targets, (node) =>
          Effect.map(catalog.getTarget(node.identity.kind), (definition) => ({
            node,
            definition,
          })),
        );
        const projectTargets = Arr.map(definitions, ({ node, definition }) => ({
          identity: node.identity,
          description: definition.description,
        }));
        // Explicit resolved targets preserve the initial provider choices in the recipe.
        const scaffoldRecipe = recipes.renderCreateCommand({
          config,
          selection: {
            targets: targets.map((node) => ({
              identity: node.identity,
              modules: modules
                .filter((module) => module.targetId === node.id)
                .map((module) => ({ id: module.moduleId })),
            })),
          },
        });
        const targetResults = yield* Effect.forEach(
          definitions,
          ({ node, definition }) =>
            Effect.gen(function* () {
              const context = new ContributionTokenContext({
                targetKey: node.id,
                identity: node.identity,
                config,
                projectTargets,
                scaffoldRecipe,
                moduleIds: modules
                  .filter((module) => module.targetId === node.id)
                  .map((module) => module.moduleId),
              });

              return {
                context,
                contribution: TargetContribution.make({
                  targetKey: node.id,
                  contributions: resolveContributionTokens(
                    definition.contributions,
                    context,
                  ),
                }),
              } as const;
            }),
        );

        const targetContexts = new Map(
          Arr.map(targetResults, (r) => [r.contribution.targetKey, r.context]),
        );

        const moduleContributions = yield* Effect.forEach(
          Arr.filter(blueprint.nodes, BlueprintNode.guards["attached-module"]),
          (node) =>
            Effect.gen(function* () {
              const context = yield* Option.match(
                Option.fromNullishOr(targetContexts.get(node.targetId)),
                {
                  onNone: () =>
                    Effect.die(
                      new Error(
                        `Validated Blueprint is missing target context ${node.targetId}`,
                      ),
                    ),
                  onSome: Effect.succeed,
                },
              );
              const moduleDefinition = yield* catalog.getModule(node.moduleId);

              return ModuleContribution.make({
                targetKey: node.targetId,
                moduleId: node.moduleId,
                contributions: resolveContributionTokens(
                  moduleDefinition.contributions,
                  context,
                ),
              });
            }),
        );

        return {
          targets: Arr.map(targetResults, (r) => r.contribution),
          modules: moduleContributions,
        } satisfies NormalizedContributions;
      });

      return { resolve };
    }),
  },
) {
  static readonly layer = Layer.effect(ContributionResolver)(
    ContributionResolver.make,
  ).pipe(Layer.provide(RecipeService.layer));
}

const resolveContributionTokens = (
  contributions: ReadonlyArray<Contribution>,
  context: ContributionTokenContext,
): ReadonlyArray<Contribution> => {
  const resolveString = (value: string) => context.resolve(value);

  return Arr.flatMap(
    contributions,
    Contribution.match({
      file: (c): ReadonlyArray<Contribution> => {
        const path = resolveString(c.path).trim();
        if (path.length === 0) return [];

        return [
          Contribution.cases.file.make({
            path,
            contents: resolveString(c.contents),
            conflictOnModify: c.conflictOnModify,
          }),
        ];
      },
      "pkg-json-entry": (c): ReadonlyArray<Contribution> => {
        const name = resolveString(c.name).trim();
        if (name.length === 0) return [];

        return [
          Contribution.cases["pkg-json-entry"].make({
            path: resolveString(c.path),
            field: c.field,
            name,
            value: resolveString(c.value),
          }),
        ];
      },
      "barrel-export": (c): ReadonlyArray<Contribution> => [
        Contribution.cases["barrel-export"].make({
          barrelPath: resolveString(c.barrelPath),
          exportPath: c.exportPath,
        }),
      ],
      "ts-call-arg": (c): ReadonlyArray<Contribution> => [
        Contribution.cases["ts-call-arg"].make({
          path: resolveString(c.path),
          targetVariable: c.targetVariable,
          functionName: c.functionName,
          argument: c.argument,
          import: c.import,
        }),
      ],
      "ts-object-field": (c): ReadonlyArray<Contribution> => [
        Contribution.cases["ts-object-field"].make({
          path: resolveString(c.path),
          targetVariable: c.targetVariable,
          functionName: c.functionName,
          field: c.field,
          value: c.value,
          import: c.import,
        }),
      ],
      "jsx-slot": (c): ReadonlyArray<Contribution> => [
        Contribution.cases["jsx-slot"].make({
          path: resolveString(c.path),
          slotId: c.slotId,
          content: c.content,
          import: c.import,
        }),
      ],
    }),
  );
};
