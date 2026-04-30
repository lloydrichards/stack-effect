import { CatalogNotFound } from "@repo/domain/Blueprint";
import type {
  ModuleDefinition,
  ModuleId,
  ModuleImplication,
  TargetDefinition,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { Context, Effect, Graph, Layer } from "effect";
import { moduleRegistry } from "./registry/moduleRegistry";
import { targetRegistry } from "./registry/targetRegistry";
import { TargetCatalog } from "./TargetCatalog";

export type CatalogNode =
  | {
      readonly _tag: "target";
      readonly definition: typeof TargetDefinition.Type;
    }
  | {
      readonly _tag: "module";
      readonly definition: typeof ModuleDefinition.Type;
    };

export type CatalogEdge = "supportedOn" | "requiredModule" | "implies";

export class ModuleCatalog extends Context.Service<ModuleCatalog>()(
  "ModuleCatalog",
  {
    make: Effect.gen(function* () {
      const targetCatalog = yield* TargetCatalog;
      const index = new Map(moduleRegistry.map((m) => [m.id, m]));

      const keys: ReadonlyArray<typeof ModuleId.Type> = Array.from(
        index.keys(),
      );

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

      const isImpliedByAny = Effect.fn("ModuleCatalog.isImpliedByAny")(
        function* (
          moduleId: typeof ModuleId.Type,
          targetKind: typeof TargetKind.Type,
        ) {
          const allImplies = moduleRegistry.flatMap((def) => def.implies ?? []);
          return allImplies.some(
            (imp: typeof ModuleImplication.Type) =>
              imp.moduleId === moduleId && imp.targetKind === targetKind,
          );
        },
      );

      const getImplications = Effect.fn("ModuleCatalog.getImplications")(
        function* (moduleIds: ReadonlyArray<typeof ModuleId.Type>) {
          const active = new Set<string>();
          for (const moduleId of moduleIds) {
            const definition = yield* get(moduleId);
            for (const imp of definition.implies ?? []) {
              active.add(`${imp.targetKind}:${imp.moduleId}`);
            }
          }
          return active;
        },
      );

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

      const toGraph = Graph.directed<CatalogNode, CatalogEdge>((g) => {
        // Add target nodes
        const targetNodes = new Map<string, number>();
        for (const target of targetRegistry) {
          const idx = Graph.addNode(g, {
            _tag: "target" as const,
            definition: target,
          });
          targetNodes.set(target.kind, idx);
        }

        // Add module nodes
        const moduleNodes = new Map<string, number>();
        for (const mod of moduleRegistry) {
          const idx = Graph.addNode(g, {
            _tag: "module" as const,
            definition: mod,
          });
          moduleNodes.set(mod.id, idx);
        }

        // Add edges
        for (const mod of moduleRegistry) {
          const modIdx = moduleNodes.get(mod.id)!;

          // supportedOn edges: module -> target
          for (const supported of mod.supportedOn) {
            if (supported._tag === "kind") {
              const targetIdx = targetNodes.get(supported.kind);
              if (targetIdx !== undefined) {
                Graph.addEdge(g, modIdx, targetIdx, "supportedOn");
              }
            } else {
              const targetIdx = targetNodes.get(supported.identity.kind);
              if (targetIdx !== undefined) {
                Graph.addEdge(g, modIdx, targetIdx, "supportedOn");
              }
            }
          }

          // requiredModule edges: module -> module
          for (const dep of mod.dependencies) {
            if (dep.requiredModule) {
              const depIdx = moduleNodes.get(dep.requiredModule.moduleId);
              if (depIdx !== undefined) {
                Graph.addEdge(g, modIdx, depIdx, "requiredModule");
              }
            }
          }

          // implies edges: module -> module (on a target)
          for (const imp of mod.implies ?? []) {
            const impliedIdx = moduleNodes.get(imp.moduleId);
            if (impliedIdx !== undefined) {
              Graph.addEdge(g, modIdx, impliedIdx, "implies");
            }
          }
        }
      });

      return {
        keys,
        get,
        isSupportedOn,
        isImpliedByAny,
        getImplications,
        targetModuleMap,
        toGraph,
      };
    }),
  },
) {
  static readonly layer = Layer.effect(ModuleCatalog)(ModuleCatalog.make).pipe(
    Layer.provide(TargetCatalog.layer),
  );
}
