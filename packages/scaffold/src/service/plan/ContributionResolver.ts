import { CatalogService } from "@repo/catalog";
import { type Blueprint, BlueprintNode } from "@repo/domain/Blueprint";
import { Contribution } from "@repo/domain/Catalog";
import {
  ContributionTokenContext,
  type ModuleContribution,
  type StackConfig,
  type TargetContribution,
} from "@repo/domain/Scaffold";
import { Array as Arr, Context, Effect, Layer, pipe, Result } from "effect";

export type NormalizedContributions = {
  readonly targets: ReadonlyArray<typeof TargetContribution.Type>;
  readonly modules: ReadonlyArray<typeof ModuleContribution.Type>;
};

export class ContributionResolver extends Context.Service<ContributionResolver>()(
  "ContributionResolver",
  {
    make: Effect.gen(function* () {
      const catalog = yield* CatalogService;

      const resolve = Effect.fn("ContributionResolver.resolve")(function* (
        blueprint: typeof Blueprint.Type,
        config: typeof StackConfig.Type,
      ) {
        const targetResults = yield* Effect.forEach(
          Arr.filter(blueprint.nodes, BlueprintNode.guards.target),
          (node) =>
            Effect.gen(function* () {
              const definition = yield* catalog.getTarget(node.identity.kind);
              const context = new ContributionTokenContext({
                targetKey: node.id,
                identity: node.identity,
                config,
              });

              return {
                context,
                contribution: {
                  targetKey: node.id,
                  contributions: resolveContributionTokens(
                    definition.contributions,
                    context,
                  ),
                } satisfies typeof TargetContribution.Type,
              } as const;
            }),
        );

        const targetContexts = new Map(
          Arr.map(targetResults, (r) => [r.contribution.targetKey, r.context]),
        );

        const moduleContributions = yield* pipe(
          Arr.filter(blueprint.nodes, BlueprintNode.guards["attached-module"]),
          Arr.filterMap((node) =>
            Result.map(
              Result.fromNullishOr(
                targetContexts.get(node.targetId),
                () => "missing" as const,
              ),
              (context) => ({ node, context }) as const,
            ),
          ),
          Effect.forEach(({ node, context }) =>
            Effect.gen(function* () {
              const moduleDefinition = yield* catalog.getModule(node.moduleId);

              return {
                targetKey: node.targetId,
                moduleId: node.moduleId,
                contributions: resolveContributionTokens(
                  moduleDefinition.contributions,
                  context,
                ),
              } satisfies typeof ModuleContribution.Type;
            }),
          ),
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
  ).pipe(Layer.provide(CatalogService.layer));
}

const resolveContributionTokens = (
  contributions: ReadonlyArray<typeof Contribution.Type>,
  context: ContributionTokenContext,
): ReadonlyArray<typeof Contribution.Type> => {
  const resolveString = (value: string) => context.resolve(value);

  return Arr.map(contributions, (contribution): typeof Contribution.Type => {
    switch (contribution._tag) {
      case "file":
        return {
          _tag: "file",
          path: resolveString(contribution.path),
          contents: resolveString(contribution.contents),
          conflictOnModify: contribution.conflictOnModify,
        };
      case "pkg-json-entry":
        return {
          _tag: "pkg-json-entry",
          path: resolveString(contribution.path),
          field: contribution.field,
          name: contribution.name,
          value: contribution.value,
        };
      case "barrel-export":
        return {
          _tag: "barrel-export",
          barrelPath: resolveString(contribution.barrelPath),
          exportPath: contribution.exportPath,
        };
      case "ts-call-arg":
        return {
          _tag: "ts-call-arg",
          path: resolveString(contribution.path),
          targetVariable: contribution.targetVariable,
          functionName: contribution.functionName,
          argument: contribution.argument,
          import: contribution.import,
        };
    }
  });
};
