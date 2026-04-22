import { CatalogNotFound } from "@repo/domain/Blueprint";
import type { RepoModuleId, TargetModuleId } from "@repo/domain/Scaffold";
import { Context, Effect, Layer } from "effect";
import { moduleRegistry } from "../registry/moduleRegistry";
import { targetModuleRegistry } from "../registry/targetModuleRegistry";

export type RepoModuleDefinition = {
  readonly moduleId: typeof RepoModuleId.Type;
};

export class ModuleCatalog extends Context.Service<ModuleCatalog>()(
  "ModuleCatalog",
  {
    make: Effect.succeed({
      getRepoModuleDefinition: (moduleId: typeof RepoModuleId.Type) =>
        Effect.fromNullishOr(moduleRegistry.get(moduleId)).pipe(
          Effect.catch(() =>
            Effect.fail(
              new CatalogNotFound({
                catalog: "module",
                entity: "repo-module",
                id: moduleId,
              }),
            ),
          ),
        ),
      getTargetModuleDefinition: (moduleId: typeof TargetModuleId.Type) =>
        Effect.fromNullishOr(targetModuleRegistry.get(moduleId)).pipe(
          Effect.catch(() =>
            Effect.fail(
              new CatalogNotFound({
                catalog: "module",
                entity: "target-module",
                id: moduleId,
              }),
            ),
          ),
        ),
    }),
  },
) {
  static readonly layer = Layer.effect(ModuleCatalog)(ModuleCatalog.make);
}
