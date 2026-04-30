import { CatalogService } from "@repo/catalog";
import {
  type Blueprint,
  isBlueprintAttachedModuleNode,
  isBlueprintTargetNode,
} from "@repo/domain/Blueprint";
import type { DesiredContributions } from "@repo/domain/Catalog";
import {
  type ContributionTokenContext,
  emptyDesiredContributions,
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
          Arr.filter(blueprint.nodes, isBlueprintTargetNode),
          (node) =>
            Effect.gen(function* () {
              const definition = yield* catalog.getTarget(node.identity.kind);
              const context: typeof ContributionTokenContext.Type = {
                targetKey: node.id,
                targetPath: node.identity.toPath(),
                targetKind: node.identity.kind,
                targetName: node.identity.name,
                runtime: config.runtimeName,
                packageManager: config.packageManagerName,
                projectName: config.name,
              };

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
          Arr.filter(blueprint.nodes, isBlueprintAttachedModuleNode),
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

export const resolveTokenString = (
  value: string,
  context: typeof ContributionTokenContext.Type,
): string =>
  value
    .replaceAll("{{targetPath}}", context.targetPath)
    .replaceAll("{{targetDir}}", context.targetPath)
    .replaceAll("{{targetKind}}", context.targetKind)
    .replaceAll("{{targetName}}", context.targetName)
    .replaceAll("{{runtime}}", context.runtime)
    .replaceAll("{{packageManager}}", context.packageManager)
    .replaceAll("{{projectName}}", context.projectName);

const resolveContributionTokens = (
  contributions: typeof DesiredContributions.Type,
  context: typeof ContributionTokenContext.Type,
): typeof DesiredContributions.Type => {
  const resolveString = (value: string) => resolveTokenString(value, context);

  return {
    ...emptyDesiredContributions(),
    files: contributions.files.map((file) => ({
      path: resolveString(file.path),
      contents: resolveString(file.contents),
    })),
    exports: contributions.exports.map((entry) => ({
      path: resolveString(entry.path),
      name: entry.name,
      value: resolveString(entry.value),
    })),
    dependencies: contributions.dependencies.map((entry) => ({
      path: resolveString(entry.path),
      section: entry.section,
      name: entry.name,
      value: entry.value,
    })),
    scripts: contributions.scripts.map((entry) => ({
      path: resolveString(entry.path),
      name: entry.name,
      value: entry.value,
    })),
    barrelExports: contributions.barrelExports.map((entry) => ({
      barrelPath: resolveString(entry.barrelPath),
      exportPath: entry.exportPath,
    })),
    tsconfigs: contributions.tsconfigs.map((entry) => ({
      path: resolveString(entry.path),
      contents: entry.contents,
    })),
  };
};
