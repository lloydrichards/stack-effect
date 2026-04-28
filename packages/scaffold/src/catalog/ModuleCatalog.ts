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
  readonly moduleId: typeof ModuleId.Type;
  readonly supportedOn: ReadonlyArray<typeof SupportedOn.Type>;
  readonly dependencies: ReadonlyArray<typeof ModuleDependency.Type>;
  readonly contributions: typeof DesiredContributions.Type;
};

export class ModuleCatalog extends Context.Service<ModuleCatalog>()(
  "ModuleCatalog",
  {
    make: Effect.succeed({
      getModuleDefinition: (moduleId: typeof ModuleId.Type) =>
        Effect.fromNullishOr(moduleRegistry.get(moduleId)).pipe(
          Effect.mapError(
            () =>
              new CatalogNotFound({
                catalog: "module",
                entity: "module",
                id: moduleId,
              }),
          ),
        ),
      isModuleSupportedOn: ({
        moduleId,
        target,
      }: {
        moduleId: typeof ModuleId.Type;
        target: TargetIdentity;
      }) =>
        Effect.gen(function* () {
          const definition = yield* Effect.fromNullishOr(
            moduleRegistry.get(moduleId),
          ).pipe(
            Effect.mapError(
              () =>
                new CatalogNotFound({
                  catalog: "module",
                  entity: "module",
                  id: moduleId,
                }),
            ),
          );

          return definition.supportedOn.some((supportedOn) =>
            target.matches(supportedOn),
          );
        }),
    }),
  },
) {
  static readonly layer = Layer.effect(ModuleCatalog)(ModuleCatalog.make);
}
