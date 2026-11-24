import { CatalogService } from "@repo/catalog";
import {
  Blueprint,
  type BlueprintAttachedModuleNode,
  type BlueprintEdge,
  BlueprintFailure,
  type BlueprintTargetNode,
  type CatalogNotFound,
  makeBlueprintEdge,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import {
  type ModuleCapability,
  ModuleDependency,
  targetPathsOverlap,
  type ModuleId,
  type TargetIdentity,
} from "@repo/domain/Catalog";
import type { Selection } from "@repo/domain/Selection";
import type { StackConfig } from "@repo/domain/StackConfig";
import {
  Array as Arr,
  Effect,
  HashMap,
  Option,
  Ref,
  SchemaIssue,
} from "effect";
import type { BlueprintService } from "../BlueprintService";

const formatSchemaIssue = SchemaIssue.makeFormatterDefault();

type ResolutionState = {
  readonly targets: HashMap.HashMap<string, BlueprintTargetNode>;
  readonly attachedModules: HashMap.HashMap<
    string,
    BlueprintAttachedModuleNode
  >;
  readonly edges: HashMap.HashMap<string, BlueprintEdge>;
};

const appendEdge = (stateRef: Ref.Ref<ResolutionState>, edge: BlueprintEdge) =>
  Ref.update(stateRef, (s) =>
    HashMap.has(s.edges, edge.id)
      ? s
      : { ...s, edges: HashMap.set(s.edges, edge.id, edge) },
  );

const validateSelection = Effect.fnUntraced(function* (
  selection: Selection,
  catalog: CatalogService["Service"],
) {
  const selectedTargetKeys = new Set<string>();

  for (const target of selection.targets) {
    const targetKey = target.identity.toKey();

    if (selectedTargetKeys.has(targetKey)) {
      return yield* new BlueprintFailure({
        message: `Duplicate target selection: ${targetKey}`,
      });
    }

    selectedTargetKeys.add(targetKey);
    const targetDefinition = yield* catalog.getTarget(target.identity.kind);

    const selectedModuleIds = new Set<ModuleId>();

    for (const moduleSelection of target.modules) {
      if (selectedModuleIds.has(moduleSelection.id)) {
        return yield* new BlueprintFailure({
          message: `Duplicate module selection: ${targetKey} requires module ${moduleSelection.id}`,
        });
      }

      selectedModuleIds.add(moduleSelection.id);
    }

    const moduleIds = new Set([
      ...target.modules.map((moduleSelection) => moduleSelection.id),
      ...(targetDefinition.requiredModules ?? []),
    ]);

    for (const moduleId of moduleIds) {
      const isSupported = yield* catalog.isSupportedOn(
        moduleId,
        target.identity,
      );

      if (!isSupported) {
        return yield* new BlueprintFailure({
          message: `Unsupported target-module combination: ${targetKey} requires module ${moduleId}`,
        });
      }
    }
  }
});

const resolveSelection = Effect.fnUntraced(function* (
  selection: Selection,
  catalog: CatalogService["Service"],
) {
  const stateRef = yield* Ref.make<ResolutionState>({
    targets: HashMap.empty(),
    attachedModules: HashMap.empty(),
    edges: HashMap.empty(),
  });

  const ensureTarget = Effect.fnUntraced(function* (identity: TargetIdentity) {
    const current = yield* Ref.get(stateRef).pipe(
      Effect.map((s) => HashMap.get(s.targets, identity.toKey())),
    );

    if (Option.isSome(current)) {
      return current.value;
    }

    yield* catalog.getTarget(identity.kind);

    const next: BlueprintTargetNode = {
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

  const ensureModuleSupportedOn = Effect.fnUntraced(function* (
    target: TargetIdentity,
    moduleId: ModuleId,
  ) {
    const isSupported = yield* catalog.isSupportedOn(moduleId, target);

    if (!isSupported) {
      return yield* new BlueprintFailure({
        message: `Unsupported target-module combination: ${target.toKey()} requires module ${moduleId}`,
      });
    }
  });

  const ensureAttachedModule: (
    target: TargetIdentity,
    moduleId: ModuleId,
  ) => Effect.Effect<
    BlueprintAttachedModuleNode,
    BlueprintFailure | CatalogNotFound
  > = Effect.fnUntraced(function* (target: TargetIdentity, moduleId: ModuleId) {
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

    const definition = yield* catalog.getModule(moduleId);
    const state = yield* Ref.get(stateRef);
    const attachedOnTarget = [...HashMap.values(state.attachedModules)].filter(
      (attached) => attached.targetId === targetState.id,
    );

    for (const attached of attachedOnTarget) {
      const attachedDefinition = yield* catalog.getModule(attached.moduleId);
      const sharedProvider = Arr.findFirst(
        definition.provides ?? [],
        (provided) => (attachedDefinition.provides ?? []).includes(provided),
      );

      if (Option.isSome(sharedProvider)) {
        return yield* new BlueprintFailure({
          message: `Multiple providers selected for capability ${sharedProvider.value} on ${targetState.id}: ${attached.moduleId}, ${moduleId}. Select exactly one provider module.`,
        });
      }

      const isIncompatible =
        (definition.conflictsWith ?? []).includes(attached.moduleId) ||
        (attachedDefinition.conflictsWith ?? []).includes(moduleId);

      if (isIncompatible) {
        return yield* new BlueprintFailure({
          message: `Incompatible modules on ${targetState.id}: ${attached.moduleId} conflicts with ${moduleId}`,
        });
      }
    }

    const next: BlueprintAttachedModuleNode = {
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

    yield* appendEdge(
      stateRef,
      makeBlueprintEdge("owns-module", targetState.id, attachedModuleNodeId),
    );

    const dependencyTargetOf = (dependencyTarget: TargetIdentity) =>
      dependencyTarget.kind !== "package" &&
      dependencyTarget.kind === target.kind
        ? target
        : dependencyTarget;

    const requireTarget = Effect.fnUntraced(function* (
      identity: TargetIdentity,
    ) {
      const requiredTarget = yield* ensureTarget(identity);

      yield* appendEdge(
        stateRef,
        makeBlueprintEdge(
          "required-target",
          attachedModuleNodeId,
          requiredTarget.id,
        ),
      );
    });

    const requireModule = Effect.fnUntraced(function* (
      dependencyTarget: TargetIdentity,
      requiredModuleId: ModuleId,
    ) {
      // NOTE: Required modules emit both target and module edges so graph consumers can see the full closure.
      yield* requireTarget(dependencyTarget);

      const requiredModule = yield* ensureAttachedModule(
        dependencyTarget,
        requiredModuleId,
      );

      yield* appendEdge(
        stateRef,
        makeBlueprintEdge(
          "required-module",
          attachedModuleNodeId,
          requiredModule.id,
        ),
      );
    });

    const requireCapability = Effect.fnUntraced(function* (
      dependencyTarget: TargetIdentity,
      capability: ModuleCapability,
    ) {
      const selectedTarget = Arr.findFirst(
        selection.targets,
        (selected) => selected.identity.toKey() === dependencyTarget.toKey(),
      );
      const providers = Option.isSome(selectedTarget)
        ? yield* Effect.filter(selectedTarget.value.modules, (selectedModule) =>
            catalog
              .getModule(selectedModule.id)
              .pipe(
                Effect.map((definition) =>
                  (definition.provides ?? []).includes(capability),
                ),
              ),
          )
        : [];

      const providerDefinition = providers[0];
      if (providers.length !== 1 || providerDefinition === undefined) {
        return yield* new BlueprintFailure({
          message: `Unresolved capability dependency: ${target.toKey()} requires module ${moduleId}, which needs ${capability} on ${dependencyTarget.toKey()}. Select exactly one provider module explicitly.`,
        });
      }

      yield* requireModule(dependencyTarget, providerDefinition.id);
    });

    for (const dependency of definition.dependencies) {
      yield* ModuleDependency.match(dependency, {
        "required-target": (dep) => requireTarget(dep.identity),
        "required-module": (dep) =>
          requireModule(dependencyTargetOf(dep.target), dep.moduleId),
        "required-capability": (dep) =>
          requireCapability(dependencyTargetOf(dep.target), dep.capability),
      });
    }

    return next;
  });

  for (const target of selection.targets) {
    yield* ensureTarget(target.identity);

    const targetDefinition = yield* catalog.getTarget(target.identity.kind);
    const moduleIds = new Set([
      ...target.modules.map((moduleSelection) => moduleSelection.id),
      ...(targetDefinition.requiredModules ?? []),
    ]);

    for (const moduleId of moduleIds) {
      yield* ensureAttachedModule(target.identity, moduleId);
    }
  }

  return yield* Ref.get(stateRef);
});

/** @internal */
export const make = Effect.gen(function* () {
  const catalog = yield* CatalogService;

  const resolve = Effect.fn("BlueprintService.resolve")(function* (
    selection: Selection,
    config?: StackConfig,
  ) {
    yield* validateSelection(selection, catalog);

    const finalState = yield* resolveSelection(selection, catalog);
    const targets = [...HashMap.values(finalState.targets)];
    const owned = targets.filter((node) => node.identity.kind !== "workspace");
    const collisions = owned.flatMap((left, index) =>
      owned
        .slice(index + 1)
        .filter(
          (right) =>
            targetPathsOverlap(
              left.identity.toPath(),
              right.identity.toPath(),
            ) ||
            left.identity.toPackageName() === right.identity.toPackageName(),
        )
        .map(
          (right) =>
            `${left.id} (${left.identity.toPackageName()}) and ${right.id} (${right.identity.toPackageName()})`,
        ),
    );
    if (collisions.length > 0)
      return yield* new BlueprintFailure({
        message: `Overlapping target ownership: ${collisions.join("; ")}`,
      });

    const blueprint = yield* Blueprint.makeEffect({
      nodes: [...targets, ...HashMap.values(finalState.attachedModules)],
      edges: [...HashMap.values(finalState.edges)],
    }).pipe(
      Effect.mapError(
        (cause) =>
          new BlueprintFailure({
            message: `Invalid resolved Blueprint: ${formatSchemaIssue(cause)}`,
            cause,
          }),
      ),
    );

    if (config !== undefined) {
      for (const node of blueprint.nodes) {
        const definition =
          node._tag === "target"
            ? yield* catalog.getTarget(node.identity.kind)
            : yield* catalog.getModule(node.moduleId);
        const supportedRuntimes = definition.supportedRuntimes ?? [
          "bun",
          "node",
        ];
        if (!supportedRuntimes.includes(config.runtimeName)) {
          return yield* new BlueprintFailure({
            message: `Runtime ${config.runtimeName} does not support ${node._tag === "target" ? `target ${node.identity.kind}` : `module ${node.moduleId}`}.`,
          });
        }
      }
    }

    return blueprint.toSorted();
  });

  return { resolve } satisfies BlueprintService["Service"];
});
