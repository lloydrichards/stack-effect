import { CatalogNotFound } from "@repo/domain/Blueprint";
import type {
  DesiredContributions,
  ModuleDependency,
  ModuleId,
  SupportedOn,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Scaffold";
import { Context, Effect, Layer } from "effect";
import { moduleRegistry } from "./registry/moduleRegistry";
import { TargetCatalog } from "./TargetCatalog";

export type ModuleDefinition = {
  readonly id: typeof ModuleId.Type;
  readonly title: string;
  readonly description: string;
  readonly supportedOn: ReadonlyArray<typeof SupportedOn.Type>;
  readonly dependencies: ReadonlyArray<typeof ModuleDependency.Type>;
  readonly contributions: typeof DesiredContributions.Type;
};

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

      const getTargetModuleMap = (): ReadonlyMap<
        Exclude<typeof TargetKind.Type, "init">,
        ReadonlyArray<ModuleDefinition>
      > => {
        const result = new Map<
          Exclude<typeof TargetKind.Type, "init">,
          Array<ModuleDefinition>
        >();
        for (const kind of targetCatalog.keys) {
          if (kind === "init") continue;
          const modules: Array<ModuleDefinition> = [];
          for (const mod of moduleRegistry) {
            const supported = mod.supportedOn.some(
              (s) => s._tag === "kind" && s.kind === kind,
            );
            if (supported) {
              modules.push(mod);
            }
          }
          result.set(kind, modules);
        }
        return result;
      };

      return {
        get,
        isSupportedOn,
        getTargetModuleMap,
      };
    }),
  },
) {
  static readonly layer = Layer.effect(ModuleCatalog)(ModuleCatalog.make).pipe(
    Layer.provide(TargetCatalog.layer),
  );
}
