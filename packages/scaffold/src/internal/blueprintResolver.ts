import { CatalogReader } from "@repo/catalog/Catalog";
import {
  Blueprint,
  type BlueprintAttachedModuleNode,
  type BlueprintEdge,
  BlueprintError,
  BlueprintNode,
  type BlueprintTargetNode,
  type CatalogNotFound,
  makeBlueprintEdge,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import {
  defaultSupportedRuntimes,
  type ModuleCapability,
  ModuleDependency,
  targetPathsOverlap,
  type ModuleId,
  type TargetDefinition,
  TargetIdentity,
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

const formatSchemaIssue = SchemaIssue.makeFormatterDefault();

type ResolutionState = {
  targets: HashMap.HashMap<string, BlueprintTargetNode>;
  attachedModules: HashMap.HashMap<string, BlueprintAttachedModuleNode>;
  edges: HashMap.HashMap<string, BlueprintEdge>;
};

type SelectedTarget = Selection["targets"][number];

const appendEdge = (stateRef: Ref.Ref<ResolutionState>, edge: BlueprintEdge) =>
  Ref.update(stateRef, (s) =>
    HashMap.has(s.edges, edge.id)
      ? s
      : { ...s, edges: HashMap.set(s.edges, edge.id, edge) },
  );

// Selected modules first, then the target's required modules, without repeats.
const moduleIdsOf = (target: SelectedTarget, definition: TargetDefinition) =>
  Arr.dedupe([
    ...target.modules.map((moduleSelection) => moduleSelection.id),
    ...(definition.requiredModules ?? []),
  ]);

const ensureModuleSupportedOn = Effect.fnUntraced(function* (
  catalog: CatalogReader["Service"],
  target: TargetIdentity,
  moduleId: ModuleId,
) {
  const isSupported = yield* catalog.isSupportedOn(moduleId, target);
  if (!isSupported)
    return yield* new BlueprintError({
      message: `Unsupported target-module combination: ${target.toKey()} requires module ${moduleId}`,
    });
});

const validateTarget = Effect.fnUntraced(function* (
  catalog: CatalogReader["Service"],
  target: SelectedTarget,
) {
  const definition = yield* catalog.getTarget(target.identity.kind);
  const duplicate = target.modules.find((moduleSelection, index) =>
    target.modules
      .slice(0, index)
      .some((earlier) => earlier.id === moduleSelection.id),
  );
  if (duplicate !== undefined)
    return yield* new BlueprintError({
      message: `Duplicate module selection: ${target.identity.toKey()} requires module ${duplicate.id}`,
    });

  yield* Effect.forEach(
    moduleIdsOf(target, definition),
    (moduleId) => ensureModuleSupportedOn(catalog, target.identity, moduleId),
    { discard: true },
  );
});

const validateSelection = Effect.fnUntraced(function* (
  selection: Selection,
  catalog: CatalogReader["Service"],
) {
  const selectedTargetKeys = new Set<string>();
  for (const target of selection.targets) {
    const targetKey = target.identity.toKey();
    if (selectedTargetKeys.has(targetKey))
      return yield* new BlueprintError({
        message: `Duplicate target selection: ${targetKey}`,
      });
    selectedTargetKeys.add(targetKey);
    yield* validateTarget(catalog, target);
  }
});

const providesCapability = (
  catalog: CatalogReader["Service"],
  moduleId: ModuleId,
  capability: ModuleCapability,
) =>
  catalog
    .getModule(moduleId)
    .pipe(
      Effect.map((definition) =>
        (definition.provides ?? []).includes(capability),
      ),
    );

const ensureRuntimeSupported = Effect.fnUntraced(function* (
  catalog: CatalogReader["Service"],
  config: StackConfig,
  node: BlueprintNode,
) {
  const definition =
    node._tag === "target"
      ? yield* catalog.getTarget(node.identity.kind)
      : yield* catalog.getModule(node.moduleId);
  const supportedRuntimes =
    definition.supportedRuntimes ?? defaultSupportedRuntimes;
  if (!supportedRuntimes.includes(config.runtimeName))
    return yield* new BlueprintError({
      message: `Runtime ${config.runtimeName} does not support ${node._tag === "target" ? `target ${node.identity.kind}` : `module ${node.moduleId}`}.`,
    });
});

const resolveSelection = Effect.fnUntraced(function* (
  selection: Selection,
  catalog: CatalogReader["Service"],
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

    const next = BlueprintNode.cases.target.make({
      id: identity.toKey(),
      identity,
    });

    yield* Ref.update(stateRef, (s) => ({
      ...s,
      targets: HashMap.set(s.targets, identity.toKey(), next),
    }));

    return next;
  });

  const ensureAttachedModule: (
    target: TargetIdentity,
    moduleId: ModuleId,
  ) => Effect.Effect<
    BlueprintAttachedModuleNode,
    BlueprintError | CatalogNotFound
  > = Effect.fnUntraced(function* (target: TargetIdentity, moduleId: ModuleId) {
    yield* ensureModuleSupportedOn(catalog, target, moduleId);

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
        return yield* new BlueprintError({
          message: `Multiple providers selected for capability ${sharedProvider.value} on ${targetState.id}: ${attached.moduleId}, ${moduleId}. Select exactly one provider module.`,
        });
      }

      const isIncompatible =
        (definition.conflictsWith ?? []).includes(attached.moduleId) ||
        (attachedDefinition.conflictsWith ?? []).includes(moduleId);

      if (isIncompatible) {
        return yield* new BlueprintError({
          message: `Incompatible modules on ${targetState.id}: ${attached.moduleId} conflicts with ${moduleId}`,
        });
      }
    }

    const next = BlueprintNode.cases["attached-module"].make({
      id: attachedModuleNodeId,
      targetId: targetState.id,
      moduleId,
    });

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

    const placedReference = Effect.fnUntraced(function* (
      dependencyTarget: TargetIdentity,
    ) {
      // shortcut: CAFE imports fixed folders, revisit when its imports can follow resolved targets.
      const allowNamedPlacement = moduleId !== "workspace-alchemy-cafe";
      const selected =
        selection.targets.find(
          ({ identity }) => identity.toKey() === dependencyTarget.toKey(),
        ) ??
        selection.targets.find(
          ({ identity }) =>
            (allowNamedPlacement || identity.placement !== "named") &&
            identity.matchesReference(dependencyTarget),
        );
      if (selected !== undefined) return selected.identity;
      if (
        dependencyTarget.kind === "package" ||
        dependencyTarget.kind === "workspace"
      )
        return dependencyTarget;
      if (!allowNamedPlacement) {
        return new TargetIdentity({
          kind: dependencyTarget.kind,
          name: dependencyTarget.name,
          placement: "implicit",
        });
      }
      const definition = yield* catalog.getTarget(dependencyTarget.kind);
      return dependencyTarget.placeCatalogReference(definition.defaultName);
    });

    const dependencyTargetOf = (reference: TargetIdentity) =>
      reference.kind !== "package" && reference.kind === target.kind
        ? Effect.succeed(target)
        : placedReference(reference);

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
            providesCapability(catalog, selectedModule.id, capability),
          )
        : [];

      const providerDefinition = providers[0];
      if (providers.length !== 1 || providerDefinition === undefined) {
        return yield* new BlueprintError({
          message: `Unresolved capability dependency: ${target.toKey()} requires module ${moduleId}, which needs ${capability} on ${dependencyTarget.toKey()}. Select exactly one provider module explicitly.`,
        });
      }

      yield* requireModule(dependencyTarget, providerDefinition.id);
    });

    yield* Effect.forEach(
      definition.dependencies,
      ModuleDependency.match({
        "required-target": (dep) =>
          Effect.flatMap(placedReference(dep.identity), requireTarget),
        "required-module": (dep) =>
          Effect.flatMap(dependencyTargetOf(dep.target), (identity) =>
            requireModule(identity, dep.moduleId),
          ),
        "required-capability": (dep) =>
          Effect.flatMap(dependencyTargetOf(dep.target), (identity) =>
            requireCapability(identity, dep.capability),
          ),
      }),
      { discard: true },
    );

    return next;
  });

  const attachSelectedTarget = Effect.fnUntraced(function* (
    target: SelectedTarget,
  ) {
    yield* ensureTarget(target.identity);
    const definition = yield* catalog.getTarget(target.identity.kind);
    yield* Effect.forEach(
      moduleIdsOf(target, definition),
      (moduleId) => ensureAttachedModule(target.identity, moduleId),
      { discard: true },
    );
  });

  yield* Effect.forEach(selection.targets, attachSelectedTarget, {
    discard: true,
  });

  return yield* Ref.get(stateRef);
});

/** @internal */
export const make = Effect.gen(function* () {
  const catalog = yield* CatalogReader;

  const resolve = Effect.fn("BlueprintResolver.resolve")(function* (
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
      return yield* new BlueprintError({
        message: `Overlapping target ownership: ${collisions.join("; ")}`,
      });

    const blueprint = yield* Blueprint.makeEffect({
      nodes: [...targets, ...HashMap.values(finalState.attachedModules)],
      edges: [...HashMap.values(finalState.edges)],
    }).pipe(
      Effect.mapError(
        (cause) =>
          new BlueprintError({
            message: `Invalid resolved Blueprint: ${formatSchemaIssue(cause)}`,
            cause,
          }),
      ),
    );

    if (config !== undefined)
      yield* Effect.forEach(
        blueprint.nodes,
        (node) => ensureRuntimeSupported(catalog, config, node),
        { discard: true },
      );

    return blueprint.toSorted();
  });

  return { resolve };
});
