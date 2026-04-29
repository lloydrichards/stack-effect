import { ModuleCatalog, TargetCatalog } from "@repo/catalog";
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
  type TargetContribution,
} from "@repo/domain/Scaffold";
import { Context, Effect, Layer } from "effect";

export type NormalizedContributions = {
  readonly targets: ReadonlyArray<typeof TargetContribution.Type>;
  readonly modules: ReadonlyArray<typeof ModuleContribution.Type>;
};

export class ContributionResolver extends Context.Service<ContributionResolver>()(
  "ContributionResolver",
  {
    make: Effect.gen(function* () {
      const targetCatalog = yield* TargetCatalog;
      const moduleCatalog = yield* ModuleCatalog;

      const resolve = Effect.fn("ContributionResolver.resolve")(function* (
        blueprint: typeof Blueprint.Type,
      ) {
        const targetNodes = blueprint.nodes.filter(isBlueprintTargetNode);
        const attachedModuleNodes = blueprint.nodes.filter(
          isBlueprintAttachedModuleNode,
        );
        const targetContexts = new Map<
          string,
          typeof ContributionTokenContext.Type
        >();
        const targetContributions: Array<typeof TargetContribution.Type> = [];
        const moduleContributions: Array<typeof ModuleContribution.Type> = [];

        for (const node of targetNodes) {
          const definition = yield* targetCatalog.get(node.identity.kind);
          const context: typeof ContributionTokenContext.Type = {
            targetKey: node.id,
            targetPath: node.identity.toPath(),
            targetKind: node.identity.kind,
            targetName: node.identity.name,
          };

          targetContexts.set(node.id, context);

          targetContributions.push({
            targetKey: node.id,
            contributions: resolveContributionTokens(
              definition.contributions,
              context,
            ),
          });
        }

        for (const node of attachedModuleNodes) {
          const context = targetContexts.get(node.targetId);

          if (context === undefined) {
            continue;
          }

          const moduleDefinition = yield* moduleCatalog.get(node.moduleId);

          moduleContributions.push({
            targetKey: node.targetId,
            moduleId: node.moduleId,
            contributions: resolveContributionTokens(
              moduleDefinition.contributions,
              context,
            ),
          });
        }

        return {
          targets: targetContributions,
          modules: moduleContributions,
        } satisfies NormalizedContributions;
      });

      return { resolve };
    }),
  },
) {
  static readonly layer = Layer.effect(ContributionResolver)(
    ContributionResolver.make,
  ).pipe(
    Layer.provide(TargetCatalog.layer),
    Layer.provide(ModuleCatalog.layer),
  );
}

const resolveContributionTokens = (
  contributions: typeof DesiredContributions.Type,
  context: typeof ContributionTokenContext.Type,
): typeof DesiredContributions.Type => {
  const resolveString = (value: string) =>
    value
      .replaceAll("{{targetPath}}", context.targetPath)
      .replaceAll("{{targetDir}}", context.targetPath)
      .replaceAll("{{targetKind}}", context.targetKind)
      .replaceAll("{{targetName}}", context.targetName);

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
