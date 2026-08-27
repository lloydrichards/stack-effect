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
  type ArchitectureId,
  ClassicArchitecture,
  type ContextMetadata,
  ModuleDependency,
  type ModuleId,
  type TargetIdentity,
  TargetPath,
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
  SchemaIssue,
} from "effect";

const formatSchemaIssue = SchemaIssue.makeFormatterDefault();

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
        const closedState = yield* Ref.get(state);
        const resolvedTargets = yield* Effect.forEach(
          Arr.fromIterable(HashMap.values(closedState.targets)),
          (target) => resolveTargetLayout(target, closedState, catalog),
        );
        const finalState = {
          ...closedState,
          targets: HashMap.fromIterable(
            resolvedTargets.map((target) => [target.id, target]),
          ),
        };

        const blueprint = yield* Blueprint.makeEffect({
          nodes: [
            ...HashMap.values(finalState.targets),
            ...HashMap.values(finalState.attachedModules),
          ],
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

        return blueprint.toSorted();
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
      const architecture = target.architecture ?? ClassicArchitecture;
      const targetDefinition = yield* catalog.resolveTarget(
        target.identity.kind,
        architecture,
      );
      if (targetDefinition === undefined) {
        throw new BlueprintFailure({
          message: `Unsupported architecture ${architecture} for ${targetKey}`,
        });
      }

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
          architecture,
        );
        const resolvedModule = isSupported
          ? yield* catalog.resolveModule(moduleId, architecture)
          : undefined;

        if (!isSupported || resolvedModule === undefined) {
          throw new BlueprintFailure({
            message:
              architecture === "ddd"
                ? `DDD currently supports only server/api with Todo HTTP (server-http-api-todos); ${moduleId} is Classic-only.`
                : `Unsupported target-module combination: ${targetKey} requires module ${moduleId}`,
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

    const ensureTarget = Effect.fn(function* (
      identity: TargetIdentity,
      architecture: typeof ArchitectureId.Type = ClassicArchitecture,
    ) {
      const current = yield* Ref.get(stateRef).pipe(
        Effect.map((s) => HashMap.get(s.targets, identity.toKey())),
      );

      if (Option.isSome(current)) {
        if (current.value.architecture !== architecture) {
          throw new BlueprintFailure({
            message: `Conflicting architecture for ${identity.toKey()}: ${current.value.architecture} and ${architecture}`,
          });
        }
        return current.value;
      }

      const definition = yield* catalog.resolveTarget(
        identity.kind,
        architecture,
      );
      if (definition === undefined) {
        throw new BlueprintFailure({
          message:
            architecture === "ddd"
              ? `DDD currently supports only server/api with Todo HTTP; target ${identity.toKey()} is Classic-only.`
              : `Unsupported architecture ${architecture} for ${identity.toKey()}`,
        });
      }

      const next: typeof BlueprintTargetNode.Type = {
        _tag: "target",
        id: identity.toKey(),
        identity,
        architecture,
        layout: {
          path: identity.toPath(),
          packageName: identity.toPackageName(),
        },
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
      architecture: typeof ArchitectureId.Type,
    ) {
      const isSupported = yield* catalog.isSupportedOn(
        moduleId,
        target,
        architecture,
      );

      if (!isSupported) {
        throw new BlueprintFailure({
          message: `Unsupported target-module combination: ${target.toKey()} requires module ${moduleId}`,
        });
      }
    });

    const ensureAttachedModule: (
      target: TargetIdentity,
      moduleId: typeof ModuleId.Type,
      architecture?: typeof ArchitectureId.Type,
    ) => Effect.Effect<
      typeof BlueprintAttachedModuleNode.Type,
      BlueprintFailure | CatalogNotFound,
      never
    > = Effect.fn(function* (
      target: TargetIdentity,
      moduleId: typeof ModuleId.Type,
      architecture = ClassicArchitecture,
    ) {
      yield* ensureModuleSupportedOn(target, moduleId, architecture);

      const targetState = yield* ensureTarget(target, architecture);
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

      const definition = yield* catalog.resolveModule(moduleId, architecture);
      if (definition === undefined) {
        throw new BlueprintFailure({
          message:
            architecture === "ddd"
              ? `DDD currently supports only server/api with Todo HTTP (server-http-api-todos); ${moduleId} is Classic-only.`
              : `Unsupported architecture ${architecture} for module ${moduleId}`,
        });
      }
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
          throw new BlueprintFailure({
            message: `Multiple providers selected for capability ${sharedProvider.value} on ${targetState.id}: ${attached.moduleId}, ${moduleId}. Select exactly one provider module.`,
          });
        }

        const isIncompatible =
          (definition.conflictsWith ?? []).includes(attached.moduleId) ||
          (attachedDefinition.conflictsWith ?? []).includes(moduleId);

        if (isIncompatible) {
          throw new BlueprintFailure({
            message: `Incompatible modules on ${targetState.id}: ${attached.moduleId} conflicts with ${moduleId}`,
          });
        }
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

      for (const dependency of definition.dependencies) {
        yield* ModuleDependency.match(dependency, {
          "required-target": (dep) =>
            Effect.gen(function* () {
              const dependencyArchitecture = dep.architecture ?? architecture;
              const requiredTarget = yield* ensureTarget(
                dep.identity,
                dependencyArchitecture,
              );

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
              const dependencyArchitecture = dep.architecture ?? architecture;
              const requiredTarget = yield* ensureTarget(
                dependencyTarget,
                dependencyArchitecture,
              );

              yield* appendEdge(stateRef, {
                id: `required-target=>${attachedModuleNodeId}=>${requiredTarget.id}`,
                from: attachedModuleNodeId,
                to: requiredTarget.id,
                reason: "required-target",
              });

              const requiredModule = yield* ensureAttachedModule(
                dependencyTarget,
                dep.moduleId,
                dependencyArchitecture,
              );

              yield* appendEdge(stateRef, {
                id: `required-module=>${attachedModuleNodeId}=>${requiredModule.id}`,
                from: attachedModuleNodeId,
                to: requiredModule.id,
                reason: "required-module",
              });
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

              const dependencyArchitecture = dep.architecture ?? architecture;
              const requiredTarget = yield* ensureTarget(
                dependencyTarget,
                dependencyArchitecture,
              );
              yield* appendEdge(stateRef, {
                id: `required-target=>${attachedModuleNodeId}=>${requiredTarget.id}`,
                from: attachedModuleNodeId,
                to: requiredTarget.id,
                reason: "required-target",
              });

              const provider = yield* ensureAttachedModule(
                dependencyTarget,
                providerDefinition.id,
                dependencyArchitecture,
              );
              yield* appendEdge(stateRef, {
                id: `required-module=>${attachedModuleNodeId}=>${provider.id}`,
                from: attachedModuleNodeId,
                to: provider.id,
                reason: "required-module",
              });
            }),
        });
      }

      return next;
    });

    for (const target of selection.targets) {
      const architecture = target.architecture ?? ClassicArchitecture;
      yield* ensureTarget(target.identity, architecture);

      const targetDefinition = yield* catalog.resolveTarget(
        target.identity.kind,
        architecture,
      );
      if (targetDefinition === undefined)
        throw new BlueprintFailure({
          message: `Unsupported architecture ${architecture} for ${target.identity.toKey()}`,
        });
      const moduleIds = Arr.fromIterable(
        new Set([
          ...Arr.map(target.modules, (moduleSelection) => moduleSelection.id),
          ...(targetDefinition.requiredModules ?? []),
        ]),
      );

      for (const moduleId of moduleIds) {
        yield* ensureAttachedModule(target.identity, moduleId, architecture);
      }
    }

    return stateRef;
  },
);

const resolveTargetLayout = Effect.fn("BlueprintService.resolveTargetLayout")(
  function* (
    target: typeof BlueprintTargetNode.Type,
    state: ResolutionState,
    catalog: typeof CatalogService.Service,
  ) {
    const definition = yield* catalog.resolveTarget(
      target.identity.kind,
      target.architecture,
    );
    if (definition === undefined)
      throw new BlueprintFailure({
        message: `Unsupported architecture ${target.architecture} for ${target.id}`,
      });
    const attached = Arr.filter(
      HashMap.values(state.attachedModules),
      (node) => node.targetId === target.id,
    );
    const contexts: ReadonlyArray<typeof ContextMetadata.Type | undefined> =
      yield* Effect.forEach(attached, (node) =>
        catalog
          .resolveModule(node.moduleId, target.architecture)
          .pipe(Effect.map((module) => module?.context)),
      );
    const owners = Arr.dedupeWith(
      Arr.filter(
        contexts,
        (context): context is typeof ContextMetadata.Type =>
          context !== undefined,
      ),
      (left: typeof ContextMetadata.Type, right: typeof ContextMetadata.Type) =>
        left.id === right.id && left.role === right.role,
    );
    if (owners.length > 1)
      throw new BlueprintFailure({
        message: `Conflicting context ownership for ${target.id}`,
      });
    const context = owners[0];
    const layoutDefinition =
      "layout" in definition
        ? definition.layout
        : definition.architecture?.layout;
    if (layoutDefinition?._tag !== "template")
      return { ...target, ...(context === undefined ? {} : { context }) };
    if (layoutDefinition.requiresContext && context === undefined)
      throw new BlueprintFailure({
        message: `Missing context ownership for ${target.id}`,
      });
    const replace = (value: string) =>
      value
        .replaceAll("{{targetName}}", target.identity.name)
        .replaceAll("{{contextId}}", context?.id ?? "")
        .replaceAll("{{contextRole}}", context?.role ?? "");
    return {
      ...target,
      ...(context === undefined ? {} : { context }),
      layout: {
        path: TargetPath.make(replace(layoutDefinition.path)),
        packageName: replace(layoutDefinition.packageName),
      },
    };
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
