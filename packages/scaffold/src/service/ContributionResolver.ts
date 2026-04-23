import {
  type Blueprint,
  isBlueprintAttachedModuleNode,
  isBlueprintTargetNode,
} from "@repo/domain/Blueprint";
import {
  type ContributionTokenContext,
  type DesiredContributions,
  emptyDesiredContributions,
  type ModuleContribution,
  type TargetContribution,
} from "@repo/domain/Scaffold";
import { Context, Effect, Layer } from "effect";
import { ModuleCatalog } from "../catalog/ModuleCatalog";
import { TargetCatalog } from "../catalog/TargetCatalog";

export type NormalizedContributions = {
  readonly targets: ReadonlyArray<TargetContribution>;
  readonly modules: ReadonlyArray<ModuleContribution>;
};

export class ContributionResolver extends Context.Service<ContributionResolver>()(
  "ContributionResolver",
  {
    make: Effect.gen(function* () {
      const targetCatalog = yield* TargetCatalog;
      const moduleCatalog = yield* ModuleCatalog;

      const resolve = Effect.fn("ContributionResolver.resolve")(function* (
        blueprint: Blueprint,
      ) {
        const targetNodes = blueprint.nodes.filter(isBlueprintTargetNode);
        const attachedModuleNodes = blueprint.nodes.filter(
          isBlueprintAttachedModuleNode,
        );
        const targetContexts = new Map<string, ContributionTokenContext>();
        const targetContributions: Array<TargetContribution> = [];
        const moduleContributions: Array<ModuleContribution> = [];

        for (const node of targetNodes) {
          const definition = yield* targetCatalog.getTargetDefinition(
            node.identity.kind,
          );
          const context: ContributionTokenContext = {
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

          const moduleDefinition = yield* moduleCatalog.getModuleDefinition(
            node.moduleId,
          );

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
  contributions: DesiredContributions,
  context: ContributionTokenContext,
): DesiredContributions => {
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
      contents: file.contents,
    })),
    packageJsonExports: contributions.packageJsonExports.map((entry) => ({
      packageJsonPath: resolveString(entry.packageJsonPath),
      exportKey: entry.exportKey,
      exportValue: resolveString(entry.exportValue),
    })),
    packageJsonDependencies: contributions.packageJsonDependencies.map(
      (entry) => ({
        packageJsonPath: resolveString(entry.packageJsonPath),
        section: entry.section,
        dependencyName: entry.dependencyName,
        dependencyValue: entry.dependencyValue,
      }),
    ),
    packageJsonScripts: contributions.packageJsonScripts.map((entry) => ({
      packageJsonPath: resolveString(entry.packageJsonPath),
      scriptName: entry.scriptName,
      scriptValue: entry.scriptValue,
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
