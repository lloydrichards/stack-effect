import type { Blueprint } from "@repo/domain/Blueprint";
import {
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

      const resolve = Effect.fn("ContributionResolver.resolve")(function* ({
        blueprint,
      }: {
        blueprint: Blueprint;
      }) {
        const targetContributions: Array<TargetContribution> = [];
        const moduleContributions: Array<ModuleContribution> = [];

        for (const node of blueprint.nodes) {
          const definition = yield* targetCatalog.getTargetDefinition(
            node.identity.kind,
          );
          const targetPath = yield* targetCatalog.deriveTargetPath(
            node.identity,
          );

          targetContributions.push({
            targetKey: node.id,
            contributions: resolveContributionTokens(
              definition.contributions,
              targetPath,
              node.identity.kind,
              node.identity.name,
            ),
          });

          for (const module of node.modules) {
            const moduleDefinition = yield* moduleCatalog.getModuleDefinition(
              module.moduleId,
            );

            moduleContributions.push({
              targetKey: node.id,
              moduleId: module.moduleId,
              contributions: resolveContributionTokens(
                moduleDefinition.contributions,
                targetPath,
                node.identity.kind,
                node.identity.name,
              ),
            });
          }
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
  targetPath: string,
  targetKind: string,
  targetName: string,
): DesiredContributions => {
  const resolveString = (value: string) =>
    value
      .replaceAll("{{targetPath}}", targetPath)
      .replaceAll("{{targetDir}}", targetPath)
      .replaceAll("{{targetKind}}", targetKind)
      .replaceAll("{{targetName}}", targetName);

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
