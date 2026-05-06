import type {
  CatalogGraph,
  ModuleId,
  ModuleImplication,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { CatalogNotFound } from "@repo/domain/Catalog";
import { Array as Arr, Context, Effect, Graph, Layer, Match } from "effect";
import { moduleRegistry } from "./registry/moduleRegistry";
import { targetRegistry } from "./registry/targetRegistry";

const supportedOnTargetKind = Match.type<
  typeof import("@repo/domain/Catalog").SupportedOn.Type
>().pipe(
  Match.tag("kind", (s) => s.kind),
  Match.tag("identity", (s) => s.identity.kind),
  Match.exhaustive,
);

export class CatalogService extends Context.Service<CatalogService>()(
  "CatalogService",
  {
    make: Effect.gen(function* () {
      const targetIndex = new Map(targetRegistry.map((t) => [t.kind, t]));
      const moduleIndex = new Map(moduleRegistry.map((m) => [m.id, m]));

      const allImplications = Arr.flatMap(
        moduleRegistry,
        (def) => def.implies ?? [],
      );

      const getTarget = Effect.fn("CatalogService.getTarget")(function* (
        kind: typeof TargetKind.Type,
      ) {
        return yield* Effect.fromNullishOr(targetIndex.get(kind)).pipe(
          Effect.mapError(
            () =>
              new CatalogNotFound({
                catalog: "target",
                entity: "target-kind",
                id: kind,
              }),
          ),
        );
      });

      const getModule = Effect.fn("CatalogService.getModule")(function* (
        moduleId: typeof ModuleId.Type,
      ) {
        return yield* Effect.fromNullishOr(moduleIndex.get(moduleId)).pipe(
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

      const isSupportedOn = Effect.fn("CatalogService.isSupportedOn")(
        function* (moduleId: typeof ModuleId.Type, target: TargetIdentity) {
          const definition = yield* getModule(moduleId);
          return Arr.some(definition.supportedOn, (supportedOn) =>
            target.matches(supportedOn),
          );
        },
      );

      const isImpliedByAny = Effect.fn("CatalogService.isImpliedByAny")(
        function* (
          moduleId: typeof ModuleId.Type,
          targetKind: typeof TargetKind.Type,
        ) {
          return Arr.some(
            allImplications,
            (imp: typeof ModuleImplication.Type) =>
              imp.moduleId === moduleId && imp.targetKind === targetKind,
          );
        },
      );

      const getImplications = Effect.fn("CatalogService.getImplications")(
        function* (moduleIds: ReadonlyArray<typeof ModuleId.Type>) {
          const definitions = yield* Effect.forEach(moduleIds, getModule);
          return new Set(
            Arr.flatMap(definitions, (def) =>
              Arr.map(
                def.implies ?? [],
                (imp) => `${imp.targetKind}:${imp.moduleId}`,
              ),
            ),
          );
        },
      );

      const targetKinds: ReadonlyArray<
        Exclude<typeof TargetKind.Type, "init">
      > = Arr.filter(
        Arr.fromIterable(targetIndex.keys()),
        (kind): kind is Exclude<typeof TargetKind.Type, "init"> =>
          kind !== "init",
      );

      const getSupportedModules = Effect.fn(
        "CatalogService.getSupportedModules",
      )(function* (kind: typeof TargetKind.Type) {
        yield* getTarget(kind);
        return Arr.filter(Arr.fromIterable(moduleIndex.values()), (mod) =>
          Arr.some(mod.supportedOn, (s) => supportedOnTargetKind(s) === kind),
        );
      });

      const toGraph: CatalogGraph = Graph.directed((g) => {
        const targetNodes = new Map<string, number>();
        for (const target of targetRegistry) {
          const idx = Graph.addNode(g, {
            _tag: "target" as const,
            definition: target,
          });
          targetNodes.set(target.kind, idx);
        }

        const moduleNodes = new Map<string, number>();
        for (const mod of moduleRegistry) {
          const idx = Graph.addNode(g, {
            _tag: "module" as const,
            definition: mod,
          });
          moduleNodes.set(mod.id, idx);
        }

        for (const mod of moduleRegistry) {
          const modIdx = moduleNodes.get(mod.id)!;

          for (const supported of mod.supportedOn) {
            const targetIdx = targetNodes.get(supportedOnTargetKind(supported));
            if (targetIdx !== undefined) {
              Graph.addEdge(g, modIdx, targetIdx, "supportedOn");
            }
          }

          for (const dep of mod.dependencies) {
            if (dep._tag === "required-module") {
              const depIdx = moduleNodes.get(dep.moduleId);
              if (depIdx !== undefined) {
                Graph.addEdge(g, modIdx, depIdx, "requiredModule");
              }
            }
          }

          for (const imp of mod.implies ?? []) {
            const impliedIdx = moduleNodes.get(imp.moduleId);
            if (impliedIdx !== undefined) {
              Graph.addEdge(g, modIdx, impliedIdx, "implies");
            }
          }
        }
      });

      return {
        getTarget,
        getModule,
        getImplications,
        getSupportedModules,
        isSupportedOn,
        isImpliedByAny,
        targetKinds,
        toGraph,
      };
    }),
  },
) {
  static readonly layer = Layer.effect(CatalogService)(CatalogService.make);
}
