import { CatalogService } from "@repo/catalog";
import { type Blueprint, BlueprintNode } from "@repo/domain/Blueprint";
import { type CatalogNotFound, Contribution } from "@repo/domain/Catalog";
import {
  ContributionTokenContext,
  ModuleContribution,
  NormalizedContributions,
  type StackConfig,
  TargetContribution,
} from "@repo/domain/Scaffold";
import { Context, Effect, Layer } from "effect";
import { RecipeService } from "../recipe/RecipeService";

const resolveContributionTokens = (
  contributions: ReadonlyArray<Contribution>,
  context: ContributionTokenContext,
): ReadonlyArray<Contribution> => {
  const resolveString = (value: string) => context.resolve(value);

  return contributions.flatMap(
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

export class ContributionResolver extends Context.Service<
  ContributionResolver,
  {
    readonly resolve: (
      blueprint: Blueprint,
      config: StackConfig,
    ) => Effect.Effect<NormalizedContributions, CatalogNotFound>;
  }
>()("@repo/scaffold/ContributionResolver") {
  static readonly layer = Layer.effect(
    ContributionResolver,
    Effect.gen(function* () {
      const catalog = yield* CatalogService;
      const recipes = yield* RecipeService;

      const resolve = Effect.fn("ContributionResolver.resolve")(function* (
        blueprint: Blueprint,
        config: StackConfig,
      ) {
        const targets = blueprint.nodes.filter(BlueprintNode.guards.target);
        const modules = blueprint.nodes.filter(
          BlueprintNode.guards["attached-module"],
        );
        const definitions = yield* Effect.forEach(targets, (node) =>
          Effect.map(catalog.getTarget(node.identity.kind), (definition) => ({
            node,
            definition,
          })),
        );
        const projectTargets = definitions.map(({ node, definition }) => ({
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

        const targetContexts = new Map<string, ContributionTokenContext>();
        const targetContributions = definitions.map(({ node, definition }) => {
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
          targetContexts.set(node.id, context);

          return TargetContribution.make({
            targetKey: node.id,
            contributions: resolveContributionTokens(
              definition.contributions,
              context,
            ),
          });
        });

        const moduleContributions = [];
        for (const node of modules) {
          const context = targetContexts.get(node.targetId);
          if (context === undefined) {
            return yield* Effect.die(
              new Error(
                `Validated Blueprint is missing target context ${node.targetId}`,
              ),
            );
          }
          const moduleDefinition = yield* catalog.getModule(node.moduleId);

          moduleContributions.push(
            ModuleContribution.make({
              targetKey: node.targetId,
              moduleId: node.moduleId,
              contributions: resolveContributionTokens(
                moduleDefinition.contributions,
                context,
              ),
            }),
          );
        }

        return {
          targets: targetContributions,
          modules: moduleContributions,
        } satisfies NormalizedContributions;
      });

      return ContributionResolver.of({ resolve });
    }),
  ).pipe(Layer.provide(RecipeService.layer));
}
