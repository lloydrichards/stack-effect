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
import {
  Array as Arr,
  Context,
  Effect,
  HashMap,
  Layer,
  Option,
  Ref,
} from "effect";

type ResolutionState = {
  readonly targets: HashMap.HashMap<string, typeof BlueprintTargetNode.Type>;
  readonly attachedModules: HashMap.HashMap<
    string,
    typeof BlueprintAttachedModuleNode.Type
  >;
  readonly edges: HashMap.HashMap<
    string,
    (typeof Blueprint.fields.edges.Type)[0]
  >;
};

const emptyState: ResolutionState = {
  targets: HashMap.empty(),
  attachedModules: HashMap.empty(),
  edges: HashMap.empty(),
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
        const finalState = yield* Ref.get(state);

        return new Blueprint({
          nodes: [
            ...HashMap.values(finalState.targets),
            ...HashMap.values(finalState.attachedModules),
          ],
          edges: Arr.fromIterable(HashMap.values(finalState.edges)),
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
    const stateRef = yield* Ref.make<ResolutionState>(emptyState);

    const ensureTarget = Effect.fn(function* (identity: TargetIdentity) {
      const current = yield* Ref.get(stateRef).pipe(
        Effect.map((s) => HashMap.get(s.targets, identity.toKey())),
      );

      if (Option.isSome(current)) {
        return current.value;
      }

      yield* catalog.getTarget(identity.kind);

      const next: typeof BlueprintTargetNode.Type = {
        _tag: "target",
        id: identity.toKey(),
        identity,
      };

      yield* Ref.update(stateRef, (s) => ({
        ...s,
        targets: HashMap.set(s.targets, identity.toKey(), next),
      }));

      return next;
    });

    const ensureModuleSupportedOn = Effect.fn(function* (
      target: TargetIdentity,
      moduleId: typeof ModuleId.Type,
    ) {
      const isSupported = yield* catalog.isSupportedOn(moduleId, target);

      if (!isSupported) {
        throw new BlueprintFailure({
          message: `Unsupported target-module combination: ${target.toKey()} requires module ${moduleId}`,
        });
      }
    });

    const ensureAttachedModule: (
      target: TargetIdentity,
      moduleId: typeof ModuleId.Type,
    ) => Effect.Effect<
      typeof BlueprintAttachedModuleNode.Type,
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

      const current = yield* Ref.get(stateRef).pipe(
        Effect.map((s) => HashMap.get(s.attachedModules, attachedModuleNodeId)),
      );

      if (Option.isSome(current)) {
        return current.value;
      }

      const next: typeof BlueprintAttachedModuleNode.Type = {
        _tag: "attached-module",
        id: attachedModuleNodeId,
        targetId: targetState.id,
        moduleId,
      };

      yield* Ref.update(stateRef, (s) => ({
        ...s,
        attachedModules: HashMap.set(
          s.attachedModules,
          attachedModuleNodeId,
          next,
        ),
      }));

      yield* appendEdge(stateRef, {
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

          yield* appendEdge(stateRef, {
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

          yield* appendEdge(stateRef, {
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

    return stateRef;
  },
);

const appendEdge = (
  stateRef: Ref.Ref<ResolutionState>,
  edge: (typeof Blueprint.fields.edges.Type)[0],
): Effect.Effect<void> =>
  Ref.update(stateRef, (s) =>
    HashMap.has(s.edges, edge.id)
      ? s
      : { ...s, edges: HashMap.set(s.edges, edge.id, edge) },
  );
