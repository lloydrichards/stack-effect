import type {
  CatalogGraph,
  CatalogTree,
  ModuleCapability,
  ModuleCategory,
  ModuleId,
  ModuleImplication,
  TargetIdentity,
  TargetKind,
  Visibility,
} from "@repo/domain/Catalog";
import { CatalogNotFound } from "@repo/domain/Catalog";
import {
  Array as Arr,
  Context,
  Effect,
  Graph,
  Layer,
  Match,
  Result,
} from "effect";
import { moduleRegistry } from "./registry/moduleRegistry";
import { targetRegistry } from "./registry/targetRegistry";

const supportedOnTargetKind = Match.type<
  typeof import("@repo/domain/Catalog").SupportedOn.Type
>().pipe(
  Match.tag("kind", (s) => s.kind),
  Match.tag("identity", (s) => s.identity.kind),
  Match.exhaustive,
);

const hasVisibility = (
  definition: { readonly visibility?: typeof Visibility.Type },
  visibility: typeof Visibility.Type | undefined,
): boolean =>
  visibility === undefined ||
  (definition.visibility ?? "public") === visibility;

const moduleSupportsTargetKind = (
  mod: typeof import("@repo/domain/Catalog").ModuleDefinition.Type,
  kind: typeof TargetKind.Type,
): boolean =>
  Arr.some(
    mod.supportedOn,
    (supportedOn) => supportedOnTargetKind(supportedOn) === kind,
  );

const requiredModuleDependency = Match.type<
  typeof import("@repo/domain/Catalog").ModuleDependency.Type
>().pipe(
  Match.tag("required-module", (dep) =>
    Result.succeed({
      targetKind: dep.target.kind,
      targetName: dep.target.name,
      moduleId: dep.moduleId,
    }),
  ),
  Match.orElse(() => Result.fail("skip" as const)),
);

const requiredCapabilityDependency = Match.type<
  typeof import("@repo/domain/Catalog").ModuleDependency.Type
>().pipe(
  Match.tag("required-capability", (dep) =>
    Result.succeed({
      targetKind: dep.target.kind,
      targetName: dep.target.name,
      capability: dep.capability,
    }),
  ),
  Match.orElse(() => Result.fail("skip" as const)),
);

export class CatalogService extends Context.Service<CatalogService>()(
  "CatalogService",
  {
    make: Effect.gen(function* () {
      const targetIndex = new Map(targetRegistry.map((t) => [t.kind, t]));
      const moduleIndex = new Map(moduleRegistry.map((m) => [m.id, m]));

      const capabilityProviderIndex = Arr.reduce(
        moduleRegistry,
        new Map<string, Array<(typeof moduleRegistry)[number]>>(),
        (index, definition) => {
          for (const capability of definition.provides ?? []) {
            const providers = index.get(capability) ?? [];
            providers.push(definition);
            index.set(capability, providers);
          }
          return index;
        },
      );

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

      const getTargetKinds = (options?: {
        visibility?: typeof Visibility.Type;
      }): ReadonlyArray<typeof TargetKind.Type> => {
        return Arr.map(
          Arr.filter(Arr.fromIterable(targetIndex.values()), (target) =>
            hasVisibility(target, options?.visibility),
          ),
          (target) => target.kind,
        );
      };

      const getSupportedModules = Effect.fn(
        "CatalogService.getSupportedModules",
      )(function* (
        kind: typeof TargetKind.Type,
        options?: { visibility?: typeof Visibility.Type },
      ) {
        yield* getTarget(kind);
        return Arr.filter(
          Arr.fromIterable(moduleIndex.values()),
          (mod) =>
            moduleSupportsTargetKind(mod, kind) &&
            hasVisibility(mod, options?.visibility),
        );
      });

      const getCapabilityProviders = (options: {
        capability: typeof ModuleCapability.Type;
        target: TargetIdentity;
        visibility?: typeof Visibility.Type;
      }) =>
        Arr.filter(
          capabilityProviderIndex.get(options.capability) ?? [],
          (mod) =>
            hasVisibility(mod, options.visibility) &&
            Arr.some(mod.supportedOn, (supportedOn) =>
              options.target.matches(supportedOn),
            ),
        );

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

          for (const child of mod.children ?? []) {
            const childIdx = moduleNodes.get(child.moduleId);
            if (childIdx !== undefined) {
              // NOTE: Child edges point to parents so graph consumers can traverse childOf relationships directly.
              Graph.addEdge(g, childIdx, modIdx, "childOf");
            }
          }
        }
      });

      const getModules = (options?: {
        category?: typeof ModuleCategory.Type;
        visibility?: typeof Visibility.Type;
      }): ReadonlyArray<
        typeof import("@repo/domain/Catalog").ModuleDefinition.Type
      > =>
        Arr.filter(
          Arr.fromIterable(moduleIndex.values()),
          (mod) =>
            (options?.category === undefined ||
              Arr.contains(mod.categories ?? [], options.category)) &&
            hasVisibility(mod, options?.visibility),
        );

      const toCatalogTree: typeof CatalogTree.Type = {
        targets: Arr.map(Arr.fromIterable(targetIndex.values()), (target) => ({
          kind: target.kind,
          title: target.title,
          description: target.description,
          requiredModules: target.requiredModules ?? [],
          modules: Arr.filterMap(
            Arr.fromIterable(moduleIndex.values()),
            (mod) => {
              if (!moduleSupportsTargetKind(mod, target.kind)) {
                return Result.fail("skip" as const);
              }
              return Result.succeed({
                id: mod.id,
                title: mod.title,
                description: mod.description,
                categories: mod.categories ?? [],
                requires: Arr.filterMap(
                  mod.dependencies,
                  requiredModuleDependency,
                ),
                requiredCapabilities: Arr.filterMap(
                  mod.dependencies,
                  requiredCapabilityDependency,
                ),
                provides: mod.provides ?? [],
                implies: (mod.implies ?? []).map((imp) => ({
                  targetKind: imp.targetKind,
                  moduleId: imp.moduleId,
                })),
              });
            },
          ),
        })),
      };

      return {
        getImplications,
        getCapabilityProviders,
        getModules,
        getModule,
        getSupportedModules,
        getTarget,
        getTargetKinds,
        isSupportedOn,
        isImpliedByAny,
        toCatalogTree,
        toGraph,
      };
    }),
  },
) {
  static readonly layer = Layer.effect(CatalogService)(CatalogService.make);
}
