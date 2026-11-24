import { CatalogReader } from "@repo/catalog/Catalog";
import { type Blueprint, BlueprintNode } from "@repo/domain/Blueprint";
import { Contribution } from "@repo/domain/Catalog";
import {
  ContributionTokenContext,
  ModuleContribution,
  TargetContribution,
} from "@repo/domain/Plan";
import type { StackConfig } from "@repo/domain/StackConfig";
import { Effect } from "effect";
import { RecipeResolver } from "../Recipe";

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

/** @internal */
export const makeContributionResolver = Effect.gen(function* () {
  const catalog = yield* CatalogReader;
  const recipes = yield* RecipeResolver;

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

    const targetContexts = definitions.map(({ node, definition }) => ({
      node,
      definition,
      context: new ContributionTokenContext({
        targetKey: node.id,
        identity: node.identity,
        config,
        projectTargets,
        scaffoldRecipe,
        moduleIds: modules
          .filter((module) => module.targetId === node.id)
          .map((module) => module.moduleId),
      }),
    }));
    const targetContributions = targetContexts.map(
      ({ node, definition, context }) =>
        TargetContribution.make({
          targetKey: node.id,
          contributions: resolveContributionTokens(
            definition.contributions,
            context,
          ),
        }),
    );

    // A validated Blueprint has exactly one target per module.
    const attachedModules = modules.flatMap((node) =>
      targetContexts
        .filter((target) => target.node.id === node.targetId)
        .map(({ context }) => ({ node, context })),
    );
    const moduleContributions = yield* Effect.forEach(
      attachedModules,
      ({ node, context }) =>
        catalog.getModule(node.moduleId).pipe(
          Effect.map((moduleDefinition) =>
            ModuleContribution.make({
              targetKey: node.targetId,
              moduleId: node.moduleId,
              contributions: resolveContributionTokens(
                moduleDefinition.contributions,
                context,
              ),
            }),
          ),
        ),
    );

    return { targets: targetContributions, modules: moduleContributions };
  });

  return { resolve };
});
