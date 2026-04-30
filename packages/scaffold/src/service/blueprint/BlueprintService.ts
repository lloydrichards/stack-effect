import { CatalogService } from "@repo/catalog";
import {
  Blueprint,
  type BlueprintAttachedModuleNode,
  BlueprintFailure,
  type BlueprintTargetNode,
  type CatalogNotFound,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import type { ModuleId, TargetIdentity } from "@repo/domain/Catalog";
import type { Selection } from "@repo/domain/Selection";
import { Array as Arr, Context, Effect, Layer } from "effect";

type MutableTargetState = typeof BlueprintTargetNode.Type;

type MutableAttachedModuleState = typeof BlueprintAttachedModuleNode.Type;

type ResolutionState = {
  readonly targets: Map<string, MutableTargetState>;
  readonly attachedModules: Map<string, MutableAttachedModuleState>;
  readonly edges: Map<string, (typeof Blueprint.fields.edges.Type)[0]>;
};

export class BlueprintService extends Context.Service<BlueprintService>()(
  "BlueprintService",
  {
    make: Effect.gen(function* () {
      const catalog = yield* CatalogService;

      const resolve = Effect.fn("BlueprintService.resolve")(function* (
        selection: typeof Selection.Type,
      ) {
        yield* validateSelection(selection, catalog);

        const state = yield* resolveSelection(selection, catalog);

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
  ).pipe(Layer.provide(CatalogService.layer));
}

const validateSelection = Effect.fn("BlueprintService.validateSelection")(
  function* (
    selection: typeof Selection.Type,
    catalog: typeof CatalogService.Service,
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
      yield* catalog.getTarget(target.identity.kind);

      const selectedModuleIds = new Set<typeof ModuleId.Type>();

      for (const moduleSelection of target.modules) {
        if (selectedModuleIds.has(moduleSelection.id)) {
          throw new BlueprintFailure({
            message: `Duplicate module selection: ${targetKey} requires module ${moduleSelection.id}`,
          });
        }

        selectedModuleIds.add(moduleSelection.id);

        const isSupported = yield* catalog.isSupportedOn(
          moduleSelection.id,
          target.identity,
        );

        if (!isSupported) {
          throw new BlueprintFailure({
            message: `Unsupported target-module combination: ${targetKey} requires module ${moduleSelection.id}`,
          });
        }
      }
    }

    return undefined;
  },
);

const resolveSelection = Effect.fn("BlueprintService.resolveSelection")(
  function* (
    selection: typeof Selection.Type,
    catalog: typeof CatalogService.Service,
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

      yield* catalog.getTarget(identity.kind);

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
      moduleId: typeof ModuleId.Type,
    ) {
      const isSupported = yield* catalog.isSupportedOn(moduleId, target);

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
      moduleId: typeof ModuleId.Type,
    ) => Effect.Effect<
      MutableAttachedModuleState,
      BlueprintFailure | CatalogNotFound,
      never
    > = Effect.fn(function* (
      target: TargetIdentity,
      moduleId: typeof ModuleId.Type,
    ) {
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

      const definition = yield* catalog.getModule(moduleId);

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

const appendEdge = (
  state: ResolutionState,
  edge: (typeof Blueprint.fields.edges.Type)[0],
): void => {
  if (state.edges.has(edge.id)) {
    return;
  }

  state.edges.set(edge.id, edge);
};
