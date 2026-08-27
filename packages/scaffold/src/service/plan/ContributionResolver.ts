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
              const definition = yield* catalog.resolveTarget(
                node.identity.kind,
                node.architecture,
              );
              if (definition === undefined)
                return yield* Effect.die("Resolved target definition missing");
              const context = new ContributionTokenContext({
                targetKey: node.id,
                identity: node.identity,
                architecture: node.architecture,
                layout: node.layout,
                context: node.context,
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
              const moduleDefinition = yield* catalog.resolveModule(
                node.moduleId,
                context.architecture,
              );
              if (moduleDefinition === undefined)
                return yield* Effect.die("Resolved module definition missing");

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

export const resolveContributionTokens = (
  contributions: ReadonlyArray<typeof Contribution.Type>,
  context: ContributionTokenContext,
): ReadonlyArray<typeof Contribution.Type> => {
  const resolveString = (value: string) => context.resolve(value);
  const resolveImport = (value: {
    readonly moduleSpecifier: string;
    readonly namedImports?: ReadonlyArray<string> | undefined;
    readonly defaultImport?: string | undefined;
    readonly namespaceImport?: string | undefined;
  }) => ({
    moduleSpecifier: resolveString(value.moduleSpecifier),
    ...(value.namedImports === undefined
      ? {}
      : { namedImports: Arr.map(value.namedImports, resolveString) }),
    ...(value.defaultImport === undefined
      ? {}
      : { defaultImport: resolveString(value.defaultImport) }),
    ...(value.namespaceImport === undefined
      ? {}
      : { namespaceImport: resolveString(value.namespaceImport) }),
  });

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
      "json-array-entry": (c): ReadonlyArray<typeof Contribution.Type> => [
        Contribution.cases["json-array-entry"].make({
          path: resolveString(c.path),
          field: c.field,
          value: resolveString(c.value),
        }),
      ],
      "yaml-sequence-entry": (c): ReadonlyArray<typeof Contribution.Type> => [
        Contribution.cases["yaml-sequence-entry"].make({
          path: resolveString(c.path),
          key: c.key,
          value: resolveString(c.value),
        }),
      ],
      "barrel-export": (c): ReadonlyArray<typeof Contribution.Type> => [
        Contribution.cases["barrel-export"].make({
          barrelPath: resolveString(c.barrelPath),
          exportPath: resolveString(c.exportPath),
        }),
      ],
      "ts-call-arg": (c): ReadonlyArray<typeof Contribution.Type> => [
        Contribution.cases["ts-call-arg"].make({
          path: resolveString(c.path),
          targetVariable: resolveString(c.targetVariable),
          functionName: resolveString(c.functionName),
          argument: resolveString(c.argument),
          import: resolveImport(c.import),
        }),
      ],
      "ts-object-field": (c): ReadonlyArray<typeof Contribution.Type> => [
        {
          _tag: "ts-object-field",
          path: resolveString(c.path),
          targetVariable: resolveString(c.targetVariable),
          functionName: resolveString(c.functionName),
          field: resolveString(c.field),
          value: resolveString(c.value),
          ...(c.import === undefined
            ? {}
            : { import: resolveImport(c.import) }),
        },
      ],
      "jsx-slot": (c): ReadonlyArray<typeof Contribution.Type> => [
        {
          _tag: "jsx-slot",
          path: resolveString(c.path),
          slotId: resolveString(c.slotId),
          content: resolveString(c.content),
          ...(c.import === undefined
            ? {}
            : { import: resolveImport(c.import) }),
        },
      ],
    }),
  );
};
