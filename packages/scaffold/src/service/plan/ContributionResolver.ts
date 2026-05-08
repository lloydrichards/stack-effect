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
import { Array as Arr, Context, Effect, Layer, pipe, Result } from "effect";

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

              return ModuleContribution.make({
                targetKey: node.targetId,
                moduleId: node.moduleId,
                contributions: resolveContributionTokens(
                  moduleDefinition.contributions,
                  context,
                ),
              });
            }),
          ),
        );

        return {
          targets: Arr.map(targetResults, (r) => r.contribution),
          modules: moduleContributions,
        } satisfies typeof NormalizedContributions.Type;
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

  return Arr.map(
    contributions,
    Contribution.match({
      file: (c): typeof Contribution.Type =>
        Contribution.cases.file.make({
          path: resolveString(c.path),
          contents: resolveString(c.contents),
          conflictOnModify: c.conflictOnModify,
        }),
      "pkg-json-entry": (c): typeof Contribution.Type =>
        Contribution.cases["pkg-json-entry"].make({
          path: resolveString(c.path),
          field: c.field,
          name: c.name,
          value: c.value,
        }),
      "barrel-export": (c): typeof Contribution.Type =>
        Contribution.cases["barrel-export"].make({
          barrelPath: resolveString(c.barrelPath),
          exportPath: c.exportPath,
        }),
      "ts-call-arg": (c): typeof Contribution.Type =>
        Contribution.cases["ts-call-arg"].make({
          path: resolveString(c.path),
          targetVariable: c.targetVariable,
          functionName: c.functionName,
          argument: c.argument,
          import: c.import,
        }),
    }),
  );
};
