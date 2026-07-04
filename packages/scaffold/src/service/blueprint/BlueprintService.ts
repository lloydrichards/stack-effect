import { CatalogService } from "@repo/catalog";
import {
  Blueprint,
  type BlueprintAttachedModuleNode,
  BlueprintFailure,
  type BlueprintTargetNode,
  type CatalogNotFound,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import {
  ModuleDependency,
  type ModuleId,
  type TargetIdentity,
} from "@repo/domain/Catalog";
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
    typeof Blueprint.fields.edges.value.Type
  >;
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
      const targetDefinition = yield* catalog.getTarget(target.identity.kind);

      const selectedModuleIds = new Set<typeof ModuleId.Type>();

      for (const moduleSelection of target.modules) {
        if (selectedModuleIds.has(moduleSelection.id)) {
          throw new BlueprintFailure({
            message: `Duplicate module selection: ${targetKey} requires module ${moduleSelection.id}`,
          });
        }

        selectedModuleIds.add(moduleSelection.id);
      }

      const moduleIds = Arr.fromIterable(
        new Set([
          ...Arr.map(target.modules, (moduleSelection) => moduleSelection.id),
          ...(targetDefinition.requiredModules ?? []),
        ]),
      );

      for (const moduleId of moduleIds) {
        const isSupported = yield* catalog.isSupportedOn(
          moduleId,
          target.identity,
        );

        if (!isSupported) {
          throw new BlueprintFailure({
            message: `Unsupported target-module combination: ${targetKey} requires module ${moduleId}`,
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
    const stateRef = yield* Ref.make<ResolutionState>({
      targets: HashMap.empty(),
      attachedModules: HashMap.empty(),
      edges: HashMap.empty(),
    });

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
        yield* ModuleDependency.match(dependency, {
          "required-target": (dep) =>
            Effect.gen(function* () {
              const requiredTarget = yield* ensureTarget(dep.identity);

              yield* appendEdge(stateRef, {
                id: `required-target=>${attachedModuleNodeId}=>${requiredTarget.id}`,
                from: attachedModuleNodeId,
                to: requiredTarget.id,
                reason: "required-target",
              });
            }),

          "required-module": (dep) =>
            Effect.gen(function* () {
              const dependencyTarget =
                dep.target.kind !== "package" && dep.target.kind === target.kind
                  ? target
                  : dep.target;

              // NOTE: Required modules emit both target and module edges so graph consumers can see the full closure.
              const requiredTarget = yield* ensureTarget(dependencyTarget);

              yield* appendEdge(stateRef, {
                id: `required-target=>${attachedModuleNodeId}=>${requiredTarget.id}`,
                from: attachedModuleNodeId,
                to: requiredTarget.id,
                reason: "required-target",
              });

              const requiredModule = yield* ensureAttachedModule(
                dependencyTarget,
                dep.moduleId,
              );

              yield* appendEdge(stateRef, {
                id: `required-module=>${attachedModuleNodeId}=>${requiredModule.id}`,
                from: attachedModuleNodeId,
                to: requiredModule.id,
                reason: "required-module",
              });
            }),
          "required-capability": (dep) =>
            Effect.fail(
              new BlueprintFailure({
                message: `Unresolved capability dependency: ${target.toKey()} requires module ${moduleId}, which needs ${dep.capability} on ${dep.target.toKey()}. Select a provider module explicitly.`,
              }),
            ),
        });
      }

      return next;
    });

    for (const target of selection.targets) {
      yield* ensureTarget(target.identity);

      const targetDefinition = yield* catalog.getTarget(target.identity.kind);
      const moduleIds = Arr.fromIterable(
        new Set([
          ...Arr.map(target.modules, (moduleSelection) => moduleSelection.id),
          ...(targetDefinition.requiredModules ?? []),
        ]),
      );

      for (const moduleId of moduleIds) {
        yield* ensureAttachedModule(target.identity, moduleId);
      }
    }

    return stateRef;
  },
);

const appendEdge = (
  stateRef: Ref.Ref<ResolutionState>,
  edge: (typeof Blueprint.fields.edges.Type)[0],
) =>
  Ref.update(stateRef, (s) =>
    HashMap.has(s.edges, edge.id)
      ? s
      : { ...s, edges: HashMap.set(s.edges, edge.id, edge) },
  );
