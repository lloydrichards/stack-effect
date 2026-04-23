import { CatalogNotFound } from "@repo/domain/Blueprint";
import type {
  DesiredContributions,
  ModuleDependency,
  ModuleId,
  SupportedOn,
  TargetIdentity,
} from "@repo/domain/Scaffold";
import { Context, Effect, Layer } from "effect";
import { moduleRegistry } from "../registry/moduleRegistry";

export type ModuleDefinition = {
  readonly moduleId: ModuleId;
  readonly supportedOn: ReadonlyArray<SupportedOn>;
  readonly dependencies: ReadonlyArray<ModuleDependency>;
  readonly contributions: DesiredContributions;
};

const matchesSupportedOn = (
  target: TargetIdentity,
  supportedOn: SupportedOn,
): boolean => {
  switch (supportedOn._tag) {
    case "identity":
      return (
        supportedOn.identity.kind === target.kind &&
        supportedOn.identity.name === target.name
      );
    case "kind":
      return supportedOn.kind === target.kind;
  }
};

export class ModuleCatalog extends Context.Service<ModuleCatalog>()(
  "ModuleCatalog",
  {
    make: Effect.succeed({
      getModuleDefinition: (moduleId: ModuleId) =>
        Effect.fromNullishOr(moduleRegistry.get(moduleId)).pipe(
          Effect.catch(() =>
            Effect.fail(
              new CatalogNotFound({
                catalog: "module",
                entity: "module",
                id: moduleId,
              }),
            ),
          ),
        ),
      isModuleSupportedOn: ({
        moduleId,
        target,
      }: {
        moduleId: ModuleId;
        target: TargetIdentity;
      }) =>
        Effect.gen(function* () {
          const definition = yield* Effect.fromNullishOr(
            moduleRegistry.get(moduleId),
          ).pipe(
            Effect.catch(() =>
              Effect.fail(
                new CatalogNotFound({
                  catalog: "module",
                  entity: "module",
                  id: moduleId,
                }),
              ),
            ),
          );

          return definition.supportedOn.some((supportedOn) =>
            matchesSupportedOn(target, supportedOn),
          );
        }),
    }),
  },
) {
  static readonly layer = Layer.effect(ModuleCatalog)(ModuleCatalog.make);
}
