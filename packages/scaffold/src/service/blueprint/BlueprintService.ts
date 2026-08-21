import { CatalogService } from "@repo/catalog";
import {
  Blueprint,
  type BlueprintAttachedModuleNode,
  BlueprintFailure,
  BlueprintNode,
  type BlueprintTargetNode,
  type CatalogNotFound,
  toAttachedModuleNodeId,
} from "@repo/domain/Blueprint";
import {
  GenerationDomainBinding,
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
        const domainBindings = yield* resolveDomainBindings(selection, catalog);

        const state = yield* resolveSelection(selection, catalog);
        const finalState = yield* Ref.get(state);

        const blueprint = yield* Blueprint.makeEffect({
          nodes: [
            ...HashMap.values(finalState.targets),
            ...HashMap.values(finalState.attachedModules),
          ],
          edges: Arr.fromIterable(HashMap.values(finalState.edges)),
          ...(domainBindings.length === 0 ? {} : { domainBindings }),
        }).pipe(
          Effect.mapError(
            (cause) =>
              new BlueprintFailure({
                message: `Invalid resolved Blueprint: ${formatSchemaIssue(cause)}`,
                cause,
              }),
          ),
        );

        yield* validateResolvedDomainModules(blueprint, selection, catalog);
        return blueprint.toSorted();
      });

      return { resolve };
    }),
  },
) {
  static readonly baseLayer = Layer.effect(BlueprintService)(
    BlueprintService.make,
  );

  static readonly layer = BlueprintService.baseLayer.pipe(
    Layer.provide(CatalogService.layer),
  );
}

const resolveDomainBindings = Effect.fn(
  "BlueprintService.resolveDomainBindings",
)(function* (
  selection: typeof Selection.Type,
  catalog: typeof CatalogService.Service,
) {
  return yield* Effect.forEach(selection.domains ?? [], (domain) =>
    Effect.gen(function* () {
      const option = yield* catalog.getGenerationDomainOption(
        domain.id,
        domain.option,
      );
      const candidates = Arr.filter(
        selection.targets,
        (target) => target.identity.kind !== "workspace",
      );
      if (
        candidates.length < option.minimumBindings ||
        candidates.length > option.maximumBindings
      ) {
        const targetIds = Arr.map(candidates, (candidate) =>
          candidate.identity.toKey(),
        );
        return yield* new BlueprintFailure({
          message: `Generation domain ${domain.id}/${domain.option} requires ${option.minimumBindings}-${option.maximumBindings} explicit deployable targets; received ${candidates.length}: ${Arr.join(targetIds, ", ")}`,
          reason: "binding-cardinality",
          domainId: domain.id,
          optionId: domain.option,
          targetIds,
        });
      }
      return yield* Effect.forEach(candidates, (candidate) =>
        catalog
          .getGenerationDomainTargetAdapter(
            domain.id,
            domain.option,
            candidate.identity.kind,
          )
          .pipe(
            Effect.mapError(
              () =>
                new BlueprintFailure({
                  message: `Unsupported target ${candidate.identity.toKey()} for generation domain ${domain.id}/${domain.option}`,
                  reason: "unsupported-target",
                  domainId: domain.id,
                  optionId: domain.option,
                  targetId: candidate.identity.toKey(),
                }),
            ),
            Effect.flatMap((adapter) => {
              const unsupported = Arr.filter(
                candidate.modules,
                (module) =>
                  !adapter.supportedSelectedModules.includes(module.id),
              );
              return unsupported.length === 0
                ? Effect.succeed(
                    new GenerationDomainBinding({
                      domainId: domain.id,
                      optionId: domain.option,
                      targetId: candidate.identity.toKey(),
                      adapterId: adapter.adapterId,
                    }),
                  )
                : Effect.fail(
                    new BlueprintFailure({
                      message: `Unsupported selected module ${unsupported[0]?.id} on ${candidate.identity.toKey()} for generation domain ${domain.id}/${domain.option}`,
                      reason: "unsupported-module",
                      domainId: domain.id,
                      optionId: domain.option,
                      targetId: candidate.identity.toKey(),
                      moduleId: unsupported[0]!.id,
                      moduleSource: "selected",
                    }),
                  );
            }),
          ),
      );
    }),
  ).pipe(Effect.map(Arr.flatten));
});

const validateResolvedDomainModules = Effect.fn(
  "BlueprintService.validateResolvedDomainModules",
)(function* (
  blueprint: typeof Blueprint.Type,
  selection: typeof Selection.Type,
  catalog: typeof CatalogService.Service,
) {
  yield* Effect.forEach(blueprint.domainBindings ?? [], (binding) =>
    Effect.gen(function* () {
      const target = blueprint.getTarget(binding.targetId);
      if (target === undefined) {
        return yield* new BlueprintFailure({
          message: `Generation domain binding target missing: ${binding.targetId}`,
          reason: "binding-target-missing",
          domainId: binding.domainId,
          optionId: binding.optionId,
          targetId: binding.targetId,
        });
      }
      const adapter = yield* catalog.getGenerationDomainTargetAdapter(
        binding.domainId,
        binding.optionId,
        target.identity.kind,
      );
      const resolvedModules = Arr.filter(
        Arr.filter(blueprint.nodes, BlueprintNode.guards["attached-module"]),
        (node) => node.targetId === binding.targetId,
      );
      const unsupported = Arr.filter(
        resolvedModules,
        (node) => !adapter.supportedResolvedModules.includes(node.moduleId),
      );
      if (unsupported.length > 0) {
        return yield* new BlueprintFailure({
          message: `Unsupported resolved module ${unsupported[0]?.moduleId} on ${binding.targetId} for generation domain ${binding.domainId}/${binding.optionId}`,
          reason: "unsupported-module",
          domainId: binding.domainId,
          optionId: binding.optionId,
          targetId: binding.targetId,
          moduleId: unsupported[0]!.moduleId,
          moduleSource: "resolved",
        });
      }
    }),
  );
  return selection;
});

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
              yield* appendEdge(stateRef, {
                id: `required-target=>${attachedModuleNodeId}=>${requiredTarget.id}`,
                from: attachedModuleNodeId,
                to: requiredTarget.id,
                reason: "required-target",
              });

              const provider = yield* ensureAttachedModule(
                dependencyTarget,
                providerDefinition.id,
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
