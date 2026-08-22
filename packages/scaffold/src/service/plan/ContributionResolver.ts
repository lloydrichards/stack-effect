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

        const domainContributions = yield* Effect.forEach(
          blueprint.domainBindings ?? [],
          (binding) =>
            Effect.gen(function* () {
              const target = blueprint.getTarget(binding.targetId);
              if (target === undefined) {
                return yield* Effect.die(
                  new Error(
                    `Validated Blueprint is missing bound target ${binding.targetId}`,
                  ),
                );
              }
              const option = yield* catalog.getGenerationDomainOption(
                binding.domainId,
                binding.optionId,
              );
              const adapter = yield* catalog.getGenerationDomainTargetAdapter(
                binding.domainId,
                binding.optionId,
                target.identity.kind,
              );
              const context = new ContributionTokenContext({
                targetKey: target.id,
                identity: target.identity,
                config,
                generationDomainAdapterId: binding.adapterId,
              });
              return [
                TargetContribution.make({
                  targetKey: target.id,
                  generationDomain: {
                    domainId: binding.domainId,
                    optionId: binding.optionId,
                  },
                  contributions: resolveContributionTokens(
                    option.rootContributions,
                    context,
                  ),
                }),
                TargetContribution.make({
                  targetKey: target.id,
                  generationDomain: {
                    domainId: binding.domainId,
                    optionId: binding.optionId,
                    adapterId: adapter.adapterId,
                  },
                  contributions: resolveContributionTokens(
                    adapter.contributions,
                    context,
                  ),
                }),
              ];
            }),
        );

        return {
          targets: [
            ...Arr.map(targetResults, (r) => r.contribution),
            ...Arr.flatten(domainContributions),
          ],
          modules: moduleContributions,
        } satisfies typeof NormalizedContributions.Type;
      });

      return { resolve };
    }),
  },
) {
  static readonly baseLayer = Layer.effect(ContributionResolver)(
    ContributionResolver.make,
  );

  static readonly layer = ContributionResolver.baseLayer.pipe(
    Layer.provide(CatalogService.layer),
  );
}

const resolveContributionTokens = (
  contributions: ReadonlyArray<typeof Contribution.Type>,
  context: ContributionTokenContext,
): ReadonlyArray<typeof Contribution.Type> => {
  const resolveString = (value: string) => context.resolve(value);

  return Arr.flatMap(
    contributions,
    Contribution.match({
      file: (c): ReadonlyArray<typeof Contribution.Type> => {
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
      "pkg-json-entry": (c): ReadonlyArray<typeof Contribution.Type> => {
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
      "barrel-export": (c): ReadonlyArray<typeof Contribution.Type> => [
        Contribution.cases["barrel-export"].make({
          barrelPath: resolveString(c.barrelPath),
          exportPath: c.exportPath,
        }),
      ],
      "ts-call-arg": (c): ReadonlyArray<typeof Contribution.Type> => [
        Contribution.cases["ts-call-arg"].make({
          path: resolveString(c.path),
          targetVariable: c.targetVariable,
          functionName: c.functionName,
          argument: c.argument,
          import: c.import,
        }),
      ],
      "ts-object-field": (c): ReadonlyArray<typeof Contribution.Type> => [
        Contribution.cases["ts-object-field"].make({
          path: resolveString(c.path),
          targetVariable: c.targetVariable,
          functionName: c.functionName,
          field: c.field,
          value: c.value,
          import: c.import,
        }),
      ],
      "jsx-slot": (c): ReadonlyArray<typeof Contribution.Type> => [
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
