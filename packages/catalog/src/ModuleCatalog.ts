import { CatalogNotFound } from "@repo/domain/Blueprint";
import type {
  ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { Context, Effect, Layer } from "effect";
import { moduleRegistry } from "./registry/moduleRegistry";
import { TargetCatalog } from "./TargetCatalog";

export class ModuleCatalog extends Context.Service<ModuleCatalog>()(
  "ModuleCatalog",
  {
    make: Effect.gen(function* () {
      const targetCatalog = yield* TargetCatalog;
      const index = new Map(moduleRegistry.map((m) => [m.id, m]));

      const get = Effect.fn("ModuleCatalog.get")(function* (
        moduleId: typeof ModuleId.Type,
      ) {
        return yield* Effect.fromNullishOr(index.get(moduleId)).pipe(
          Effect.mapError(
            () =>
              new CatalogNotFound({
                catalog: "module",
                entity: "module",
                id: moduleId,
              }),
          ),
        );
      });

      const isSupportedOn = Effect.fn("ModuleCatalog.isSupportedOn")(function* (
        moduleId: typeof ModuleId.Type,
        target: TargetIdentity,
      ) {
        const definition = yield* get(moduleId);

        return definition.supportedOn.some((supportedOn) =>
          target.matches(supportedOn),
        );
      });

      const targetModuleMap = Effect.gen(function* () {
        const result = new Map<
          Exclude<typeof TargetKind.Type, "init">,
          {
            readonly title: string;
            readonly description: string;
            readonly modules: ReadonlyArray<typeof ModuleDefinition.Type>;
          }
        >();

        for (const kind of targetCatalog.keys) {
          if (kind === "init") continue;
          const target = yield* targetCatalog.get(kind);
          const modules: Array<typeof ModuleDefinition.Type> = [];
          for (const mod of moduleRegistry) {
            const supported = mod.supportedOn.some(
              (s) => s._tag === "kind" && s.kind === kind,
            );
            if (supported) {
              modules.push(mod);
            }
          }
          result.set(kind, {
            title: target.title,
            description: target.description,
            modules,
          });
        }

        return result;
      });

      return {
        get,
        isSupportedOn,
        targetModuleMap,
      };
    }),
  },
) {
  static readonly layer = Layer.effect(ModuleCatalog)(ModuleCatalog.make).pipe(
    Layer.provide(TargetCatalog.layer),
  );
}
