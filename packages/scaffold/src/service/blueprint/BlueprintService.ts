import {
  Blueprint,
  type BlueprintAttachedModuleNode,
  type BlueprintEdge,
  BlueprintFailure,
  type BlueprintTargetNode,
  type CatalogNotFound,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import type { ModuleId, TargetIdentity } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import { Array as Arr, Context, Effect, Layer } from "effect";
import { ModuleCatalog } from "../../catalog/ModuleCatalog";
import { TargetCatalog } from "../../catalog/TargetCatalog";

type MutableTargetState = BlueprintTargetNode;

type MutableAttachedModuleState = BlueprintAttachedModuleNode;

type ResolutionState = {
  readonly targets: Map<string, MutableTargetState>;
  readonly attachedModules: Map<string, MutableAttachedModuleState>;
  readonly edges: Map<string, BlueprintEdge>;
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
          nodes: [
            ...Arr.fromIterable(state.targets.values()),
            ...Arr.fromIterable(state.attachedModules.values()),
          ],
          edges: Arr.fromIterable(state.edges.values()),
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
    const selectedTargetKeys = new Set<string>();

    for (const target of selection.targets) {
      const targetKey = target.identity.toKey();

      if (selectedTargetKeys.has(targetKey)) {
        throw new BlueprintFailure({
          message: `Duplicate target selection: ${targetKey}`,
        });
      }

      selectedTargetKeys.add(targetKey);
      yield* targetCatalog.getTargetDefinition(target.identity.kind);

      const selectedModuleIds = new Set<ModuleId>();

      for (const moduleSelection of target.modules) {
        if (selectedModuleIds.has(moduleSelection.id)) {
          throw new BlueprintFailure({
            message: `Duplicate module selection: ${targetKey} requires module ${moduleSelection.id}`,
          });
        }

        selectedModuleIds.add(moduleSelection.id);

        const isSupported = yield* moduleCatalog.isModuleSupportedOn({
          moduleId: moduleSelection.id,
          target: target.identity,
        });

        if (!isSupported) {
          throw new BlueprintFailure({
            message: `Unsupported target-module combination: ${targetKey} requires module ${moduleSelection.id}`,
          });
        }
      }

      if (
        target.options.httpApiStyle !== undefined &&
        !selectedModuleIds.has("http-api-server")
      ) {
        throw new BlueprintFailure({
          message:
            "Module gated target option: httpApiStyle requires module http-api-server",
        });
      }

      if (
        target.options.domainApiSurface !== undefined &&
        !selectedModuleIds.has("domain-api")
      ) {
        throw new BlueprintFailure({
          message:
            "Module gated target option: domainApiSurface requires module domain-api",
        });
      }
    }

    return undefined;
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
      attachedModules: new Map(),
      edges: new Map(),
    };

    const ensureTarget = Effect.fn(function* (identity: TargetIdentity) {
      const targetKey = identity.toKey();
      const current = state.targets.get(targetKey);

      if (current !== undefined) {
        return current;
      }

      yield* targetCatalog.getTargetDefinition(identity.kind);

      const next: MutableTargetState = {
        _tag: "target",
        id: targetKey,
        identity,
      };

      state.targets.set(targetKey, next);
      return next;
    });

    const ensureModuleSupportedOn = Effect.fn(function* (
      target: TargetIdentity,
      moduleId: ModuleId,
    ) {
      const isSupported = yield* moduleCatalog.isModuleSupportedOn({
        moduleId,
        target,
      });

      if (isSupported) {
        return;
      }

      const targetKey = target.toKey();

      throw new BlueprintFailure({
        message: `Unsupported target-module combination: ${targetKey} requires module ${moduleId}`,
      });
    });

    const ensureAttachedModule: (
      target: TargetIdentity,
      moduleId: ModuleId,
    ) => Effect.Effect<
      MutableAttachedModuleState,
      BlueprintFailure | CatalogNotFound,
      never
    > = Effect.fn(function* (target: TargetIdentity, moduleId: ModuleId) {
      yield* ensureModuleSupportedOn(target, moduleId);

      const targetState = yield* ensureTarget(target);
      const attachedModuleNodeId = toAttachedModuleNodeId(
        targetState.id,
        moduleId,
      );
      const current = state.attachedModules.get(attachedModuleNodeId);

      if (current !== undefined) {
        return current;
      }

      const next: MutableAttachedModuleState = {
        _tag: "attached-module",
        id: attachedModuleNodeId,
        targetId: targetState.id,
        moduleId,
      };

      state.attachedModules.set(attachedModuleNodeId, next);

      appendEdge(state, {
        id: `owns-module=>${targetState.id}=>${attachedModuleNodeId}`,
        from: targetState.id,
        to: attachedModuleNodeId,
        reason: "owns-module",
      });

      const definition = yield* moduleCatalog.getModuleDefinition(moduleId);

      for (const dependency of definition.dependencies) {
        if (dependency.requiredTarget !== undefined) {
          const requiredTarget = yield* ensureTarget(
            dependency.requiredTarget.identity,
          );

          appendEdge(state, {
            id: `required-target=>${attachedModuleNodeId}=>${requiredTarget.id}`,
            from: attachedModuleNodeId,
            to: requiredTarget.id,
            reason: "required-target",
          });
        }

        if (dependency.requiredModule !== undefined) {
          const requiredModule = yield* ensureAttachedModule(
            dependency.requiredModule.target,
            dependency.requiredModule.moduleId,
          );

          appendEdge(state, {
            id: `required-module=>${attachedModuleNodeId}=>${requiredModule.id}`,
            from: attachedModuleNodeId,
            to: requiredModule.id,
            reason: "required-module",
          });
        }
      }

      return next;
    });

    for (const target of selection.targets) {
      yield* ensureTarget(target.identity);

      for (const moduleSelection of target.modules) {
        yield* ensureAttachedModule(target.identity, moduleSelection.id);
      }
    }

    return state;
  },
);

const appendEdge = (state: ResolutionState, edge: BlueprintEdge): void => {
  if (state.edges.has(edge.id)) {
    return;
  }

  state.edges.set(edge.id, edge);
};
