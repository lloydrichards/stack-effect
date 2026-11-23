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
  ModuleDependency,
  targetPathsOverlap,
  type ModuleId,
  type TargetIdentity,
} from "@repo/domain/Catalog";
import type { StackConfig } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import {
  Array as Arr,
  Context,
  Effect,
  HashMap,
  Layer,
  Option,
  Ref,
  SchemaIssue,
} from "effect";

const formatSchemaIssue = SchemaIssue.makeFormatterDefault();

type ResolutionState = {
  readonly targets: HashMap.HashMap<string, BlueprintTargetNode>;
  readonly attachedModules: HashMap.HashMap<
    string,
    BlueprintAttachedModuleNode
  >;
  readonly edges: HashMap.HashMap<string, BlueprintEdge>;
};

export class BlueprintService extends Context.Service<BlueprintService>()(
  "BlueprintService",
  {
    make: Effect.gen(function* () {
      const catalog = yield* CatalogService;

      const resolve = Effect.fn("BlueprintService.resolve")(function* (
        selection: Selection,
        config?: StackConfig,
      ) {
        yield* validateSelection(selection, catalog);

        const state = yield* resolveSelection(selection, catalog);
        const finalState = yield* Ref.get(state);
        const targets = Arr.fromIterable(HashMap.values(finalState.targets));
        const owned = Arr.filter(
          targets,
          (node) => node.identity.kind !== "workspace",
        );
        const collisions = Arr.flatMap(owned, (left, index) =>
          Arr.flatMap(owned.slice(index + 1), (right) =>
            targetPathsOverlap(
              left.identity.toPath(),
              right.identity.toPath(),
            ) ||
            left.identity.toPackageName() === right.identity.toPackageName()
              ? [
                  `${left.id} (${left.identity.toPackageName()}) and ${right.id} (${right.identity.toPackageName()})`,
                ]
              : [],
          ),
        );
        if (collisions.length > 0)
          return yield* new BlueprintFailure({
            message: `Overlapping target ownership: ${collisions.join("; ")}`,
          });

        const blueprint = yield* Blueprint.makeEffect({
          nodes: [...targets, ...HashMap.values(finalState.attachedModules)],
          edges: Arr.fromIterable(HashMap.values(finalState.edges)),
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
          yield* Effect.forEach(blueprint.nodes, (node) =>
            Effect.gen(function* () {
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
            }),
          );
        }

        return blueprint.toSorted();
      });

      return { resolve };
    }),
  },
) {
  static readonly layer = Layer.effect(BlueprintService)(BlueprintService.make);
}

const validateSelection = Effect.fn("BlueprintService.validateSelection")(
  function* (selection: Selection, catalog: typeof CatalogService.Service) {
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
          return yield* new BlueprintFailure({
            message: `Unsupported target-module combination: ${targetKey} requires module ${moduleId}`,
          });
        }
      }
    }

    return undefined;
  },
);

const resolveSelection = Effect.fn("BlueprintService.resolveSelection")(
  function* (selection: Selection, catalog: typeof CatalogService.Service) {
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

    const ensureModuleSupportedOn = Effect.fn(function* (
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
      BlueprintFailure | CatalogNotFound,
      never
    > = Effect.fn(function* (target: TargetIdentity, moduleId: ModuleId) {
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
      const attachedOnTarget = yield* Ref.get(stateRef).pipe(
        Effect.map((state) =>
          Arr.filter(
            HashMap.values(state.attachedModules),
            (attached) => attached.targetId === targetState.id,
          ),
        ),
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

      for (const dependency of definition.dependencies) {
        yield* ModuleDependency.match(dependency, {
          "required-target": (dep) =>
            Effect.gen(function* () {
              const requiredTarget = yield* ensureTarget(dep.identity);

              yield* appendEdge(
                stateRef,
                makeBlueprintEdge(
                  "required-target",
                  attachedModuleNodeId,
                  requiredTarget.id,
                ),
              );
            }),

          "required-module": (dep) =>
            Effect.gen(function* () {
              const dependencyTarget =
                dep.target.kind !== "package" && dep.target.kind === target.kind
                  ? target
                  : dep.target;

              // NOTE: Required modules emit both target and module edges so graph consumers can see the full closure.
              const requiredTarget = yield* ensureTarget(dependencyTarget);

              yield* appendEdge(
                stateRef,
                makeBlueprintEdge(
                  "required-target",
                  attachedModuleNodeId,
                  requiredTarget.id,
                ),
              );

              const requiredModule = yield* ensureAttachedModule(
                dependencyTarget,
                dep.moduleId,
              );

              yield* appendEdge(
                stateRef,
                makeBlueprintEdge(
                  "required-module",
                  attachedModuleNodeId,
                  requiredModule.id,
                ),
              );
            }),
          "required-capability": (dep) =>
            Effect.gen(function* () {
              const dependencyTarget =
                dep.target.kind !== "package" && dep.target.kind === target.kind
                  ? target
                  : dep.target;
              const selectedTarget = Arr.findFirst(
                selection.targets,
                (selected) =>
                  selected.identity.toKey() === dependencyTarget.toKey(),
              );
              const providers = Option.isSome(selectedTarget)
                ? yield* Effect.filter(
                    selectedTarget.value.modules,
                    (selectedModule) =>
                      catalog
                        .getModule(selectedModule.id)
                        .pipe(
                          Effect.map((definition) =>
                            (definition.provides ?? []).includes(
                              dep.capability,
                            ),
                          ),
                        ),
                  )
                : [];

              const providerDefinition = providers[0];
              if (providers.length !== 1 || providerDefinition === undefined) {
                return yield* new BlueprintFailure({
                  message: `Unresolved capability dependency: ${target.toKey()} requires module ${moduleId}, which needs ${dep.capability} on ${dependencyTarget.toKey()}. Select exactly one provider module explicitly.`,
                });
              }

              const requiredTarget = yield* ensureTarget(dependencyTarget);
              yield* appendEdge(
                stateRef,
                makeBlueprintEdge(
                  "required-target",
                  attachedModuleNodeId,
                  requiredTarget.id,
                ),
              );

              const provider = yield* ensureAttachedModule(
                dependencyTarget,
                providerDefinition.id,
              );
              yield* appendEdge(
                stateRef,
                makeBlueprintEdge(
                  "required-module",
                  attachedModuleNodeId,
                  provider.id,
                ),
              );
            }),
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

const appendEdge = (stateRef: Ref.Ref<ResolutionState>, edge: BlueprintEdge) =>
  Ref.update(stateRef, (s) =>
    HashMap.has(s.edges, edge.id)
      ? s
      : { ...s, edges: HashMap.set(s.edges, edge.id, edge) },
  );
