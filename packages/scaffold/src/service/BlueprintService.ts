import {
  Blueprint,
  type BlueprintEdge,
  BlueprintFailure,
  type BlueprintTargetNode,
  type CatalogNotFound,
  toModuleNodeId,
} from "@repo/domain/Blueprint";
import type { ModuleId, TargetIdentity } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import { Array as Arr, Context, Effect, Layer, Order } from "effect";
import { ModuleCatalog } from "../catalog/ModuleCatalog";
import { TargetCatalog } from "../catalog/TargetCatalog";
import { selectionTargetModuleOrd, selectionTargetOrd } from "./planOrders";

type MutableTargetState = {
  readonly id: string;
  readonly identity: TargetIdentity;
  readonly selected: boolean;
  readonly modules: Map<ModuleId, boolean>;
};

type ResolutionState = {
  readonly targets: Map<string, MutableTargetState>;
  readonly edges: Map<string, BlueprintEdge>;
  readonly roots: Set<string>;
};

export class BlueprintService extends Context.Service<BlueprintService>()(
  "BlueprintService",
  {
    make: Effect.gen(function* () {
      const targetCatalog = yield* TargetCatalog;
      const moduleCatalog = yield* ModuleCatalog;

      const resolve = Effect.fn("BlueprintService.resolve")(function* (
        selection: Selection,
      ) {
        yield* validateSelection(selection, targetCatalog, moduleCatalog);

        const state = yield* resolveSelection(
          selection,
          targetCatalog,
          moduleCatalog,
        );

        return new Blueprint({
          nodes: getTargets(state),
          edges: Arr.fromIterable(state.edges.values()),
          roots: Arr.sort(state.roots, Order.String),
        }).toSorted();
      });

      return { resolve };
    }),
  },
) {
  static readonly layer = Layer.effect(BlueprintService)(
    BlueprintService.make,
  ).pipe(
    Layer.provide(TargetCatalog.layer),
    Layer.provide(ModuleCatalog.layer),
  );
}

const validateSelection = Effect.fn("BlueprintService.validateSelection")(
  function* (
    selection: Selection,
    targetCatalog: typeof TargetCatalog.Service,
    moduleCatalog: typeof ModuleCatalog.Service,
  ) {
    const selectedTargetIds = new Set<string>();

    for (const target of selection.targets) {
      const targetId = yield* targetCatalog.deriveTargetPath(target.identity);

      if (selectedTargetIds.has(targetId)) {
        yield* Effect.fail(
          new BlueprintFailure({
            message: `Duplicate target selection: ${targetId}`,
          }),
        );
      }

      selectedTargetIds.add(targetId);
      yield* targetCatalog.getTargetDefinition(target.identity.kind);

      const selectedModuleIds = new Set<ModuleId>();

      for (const moduleSelection of target.modules) {
        if (selectedModuleIds.has(moduleSelection.id)) {
          yield* Effect.fail(
            new BlueprintFailure({
              message: `Duplicate module selection: ${targetId} requires module ${moduleSelection.id}`,
            }),
          );
        }

        selectedModuleIds.add(moduleSelection.id);

        const isSupported = yield* moduleCatalog.isModuleSupportedOn({
          moduleId: moduleSelection.id,
          target: target.identity,
        });

        if (!isSupported) {
          yield* Effect.fail(
            new BlueprintFailure({
              message: `Unsupported target-module combination: ${targetId} requires module ${moduleSelection.id}`,
            }),
          );
        }
      }

      if (
        target.options.httpApiStyle !== undefined &&
        !selectedModuleIds.has("http-api-server")
      ) {
        yield* Effect.fail(
          new BlueprintFailure({
            message:
              "Module gated target option: httpApiStyle requires module http-api-server",
          }),
        );
      }

      if (
        target.options.domainApiSurface !== undefined &&
        !selectedModuleIds.has("domain-api")
      ) {
        yield* Effect.fail(
          new BlueprintFailure({
            message:
              "Module gated target option: domainApiSurface requires module domain-api",
          }),
        );
      }
    }
  },
);

const resolveSelection = Effect.fn("BlueprintService.resolveSelection")(
  function* (
    selection: Selection,
    targetCatalog: typeof TargetCatalog.Service,
    moduleCatalog: typeof ModuleCatalog.Service,
  ) {
    const state: ResolutionState = {
      targets: new Map(),
      edges: new Map(),
      roots: new Set(),
    };

    const ensureTarget = Effect.fn(function* (
      identity: TargetIdentity,
      selected: boolean,
    ) {
      const id = yield* targetCatalog.deriveTargetPath(identity);
      const current = state.targets.get(id);

      if (current !== undefined) {
        if (selected) {
          state.roots.add(id);
        }

        return current;
      }

      const next: MutableTargetState = {
        id,
        identity,
        selected,
        modules: new Map(),
      };

      state.targets.set(id, next);

      if (selected) {
        state.roots.add(id);
      }

      return next;
    });

    const ensureModule: (
      target: TargetIdentity,
      moduleId: ModuleId,
      selected: boolean,
    ) => Effect.Effect<void, BlueprintFailure | CatalogNotFound, never> =
      Effect.fn(function* (
        target: TargetIdentity,
        moduleId: ModuleId,
        selected: boolean,
      ) {
        const targetState = yield* ensureTarget(target, false);
        const moduleNodeId = toModuleNodeId(targetState.id, moduleId);
        const current = targetState.modules.get(moduleId);

        if (current !== undefined) {
          if (selected) {
            state.roots.add(moduleNodeId);
          }

          return;
        }

        targetState.modules.set(moduleId, selected);

        if (selected) {
          state.roots.add(moduleNodeId);
        }

        const definition = yield* moduleCatalog.getModuleDefinition(moduleId);

        for (const dependency of definition.dependencies) {
          if (dependency.requiredTarget !== undefined) {
            const requiredTarget = yield* ensureTarget(
              dependency.requiredTarget.identity,
              false,
            );

            appendEdge(state, {
              id: `required-target=>${moduleNodeId}=>${requiredTarget.id}`,
              from: moduleNodeId,
              to: requiredTarget.id,
              reason: "required-target",
            });
          }

          if (dependency.requiredModule !== undefined) {
            yield* ensureModule(
              dependency.requiredModule.target,
              dependency.requiredModule.moduleId,
              false,
            );

            const requiredTargetId = yield* targetCatalog.deriveTargetPath(
              dependency.requiredModule.target,
            );
            const requiredModuleNodeId = toModuleNodeId(
              requiredTargetId,
              dependency.requiredModule.moduleId,
            );

            appendEdge(state, {
              id: `required-module=>${moduleNodeId}=>${requiredModuleNodeId}`,
              from: moduleNodeId,
              to: requiredModuleNodeId,
              reason: "required-module",
            });
          }
        }
      });

    for (const target of Arr.sort(selection.targets, selectionTargetOrd)) {
      const targetState = yield* ensureTarget(target.identity, true);

      for (const moduleSelection of Arr.sort(
        target.modules,
        selectionTargetModuleOrd,
      )) {
        yield* ensureModule(target.identity, moduleSelection.id, true);
      }

      if (targetState.selected) {
        state.roots.add(targetState.id);
      }
    }

    return state;
  },
);

const getTargets = (state: ResolutionState): Array<BlueprintTargetNode> =>
  Arr.map(Arr.fromIterable(state.targets.values()), (target) => ({
    _tag: "target",
    id: target.id,
    identity: target.identity,
    modules: Arr.fromIterable(target.modules.keys()).map((moduleId) => ({
      moduleId,
    })),
  }));

const appendEdge = (state: ResolutionState, edge: BlueprintEdge): void => {
  if (state.edges.has(edge.id)) {
    return;
  }

  state.edges.set(edge.id, edge);
};
