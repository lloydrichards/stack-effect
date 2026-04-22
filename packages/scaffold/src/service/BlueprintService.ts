import {
  Blueprint,
  type BlueprintCause,
  type BlueprintDependencyEdge,
  BlueprintFailure,
  type BlueprintNodeReference,
  type BlueprintWarning,
  type CatalogNotFound,
  type ResolvedRepoModule,
  type ResolvedTarget,
  type ResolvedTargetModule,
} from "@repo/domain/Blueprint";
import type {
  RepoModuleId,
  TargetIdentity,
  TargetModuleId,
} from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import { Context, Effect, Graph, Layer } from "effect";
import { ModuleCatalog } from "../catalog/ModuleCatalog";
import { TargetCatalog } from "../catalog/TargetCatalog";

type ResolutionGraph = Graph.DirectedGraph<
  BlueprintNodeReference,
  BlueprintDependencyEdge
>;

type MutableTargetState = {
  readonly id: string;
  readonly identity: typeof TargetIdentity.Type;
  selected: boolean;
  readonly causes: Array<BlueprintCause>;
  readonly targetModules: Map<
    typeof TargetModuleId.Type,
    MutableTargetModuleState
  >;
};

type MutableTargetModuleState = {
  readonly moduleId: typeof TargetModuleId.Type;
  selected: boolean;
  readonly causes: Array<BlueprintCause>;
};

type MutableRepoModuleState = {
  readonly moduleId: typeof RepoModuleId.Type;
  selected: boolean;
  readonly causes: Array<BlueprintCause>;
};

type ResolutionState = {
  readonly targets: Map<string, MutableTargetState>;
  readonly repoModules: Map<typeof RepoModuleId.Type, MutableRepoModuleState>;
  readonly edges: Map<string, BlueprintDependencyEdge>;
};

export class BlueprintService extends Context.Service<BlueprintService>()(
  "BlueprintService",
  {
    make: Effect.gen(function* () {
      const targetCatalog = yield* TargetCatalog;
      const moduleCatalog = yield* ModuleCatalog;

      const resolve: (
        selection: typeof Selection.Type,
      ) => Effect.Effect<Blueprint, BlueprintFailure | CatalogNotFound, never> =
        Effect.fn("BlueprintService.resolve")(function* (
          selection: typeof Selection.Type,
        ) {
          yield* validateSelection(selection, targetCatalog, moduleCatalog);

          const state = yield* resolveSelection(
            selection,
            targetCatalog,
            moduleCatalog,
          );
          const graph = buildGraph(state);
          const nodes = getTargets(state);
          const modules = getRepoModules(state);
          const warnings = buildWarnings(state);
          const edges = [...graph.edges.values()].map((edge) => edge.data);

          return new Blueprint({
            nodes,
            edges,
            modules,
            warnings,
          });
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

const validateSelection: (
  selection: typeof Selection.Type,
  targetCatalog: typeof TargetCatalog.Service,
  moduleCatalog: typeof ModuleCatalog.Service,
) => Effect.Effect<void, BlueprintFailure | CatalogNotFound, never> = Effect.fn(
  "BlueprintService.validateSelection",
)(function* (
  selection: typeof Selection.Type,
  targetCatalog: typeof TargetCatalog.Service,
  moduleCatalog: typeof ModuleCatalog.Service,
) {
  const selectedTargetIds = new Set<string>();
  const impliedRepoModules = new Set<typeof RepoModuleId.Type>(
    selection.modules,
  );

  for (const target of selection.targets) {
    const targetId = toTargetId(target.identity);

    if (selectedTargetIds.has(targetId)) {
      yield* Effect.fail(
        new BlueprintFailure({
          message: `Duplicate target selection: ${targetId}`,
        }),
      );
    }

    selectedTargetIds.add(targetId);

    const targetDefinition = yield* targetCatalog.getTargetDefinition(
      target.identity.kind,
    );

    for (const repoModuleId of targetDefinition.requiredRepoModules) {
      impliedRepoModules.add(repoModuleId);
    }

    const selectedTargetModuleIds = new Set<typeof TargetModuleId.Type>();

    for (const moduleSelection of target.modules) {
      if (selectedTargetModuleIds.has(moduleSelection.id)) {
        yield* Effect.fail(
          new BlueprintFailure({
            message: `Duplicate target module selection: ${targetId} requires module ${moduleSelection.id}`,
          }),
        );
      }

      selectedTargetModuleIds.add(moduleSelection.id);

      const targetModuleDefinition =
        yield* moduleCatalog.getTargetModuleDefinition(moduleSelection.id);

      if (!targetModuleDefinition.isSupported(target.identity)) {
        yield* Effect.fail(
          new BlueprintFailure({
            message: `Unsupported target-module combination: ${targetId} requires module ${moduleSelection.id}`,
          }),
        );
      }
    }

    if (
      target.options.httpApiStyle !== undefined &&
      !selectedTargetModuleIds.has("http-api-server")
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
      !selectedTargetModuleIds.has("domain-api")
    ) {
      yield* Effect.fail(
        new BlueprintFailure({
          message:
            "Module gated target option: domainApiSurface requires module domain-api",
        }),
      );
    }
  }

  for (const repoModuleId of selection.modules) {
    yield* moduleCatalog.getRepoModuleDefinition(repoModuleId);
  }

  if (
    selection.options.linter !== undefined &&
    !impliedRepoModules.has("root-bootstrap")
  ) {
    yield* Effect.fail(
      new BlueprintFailure({
        message: "Invalid repo option: linter",
      }),
    );
  }

  if (
    selection.options.runtime !== undefined &&
    !impliedRepoModules.has("root-bootstrap")
  ) {
    yield* Effect.fail(
      new BlueprintFailure({
        message: "Invalid repo option: runtime",
      }),
    );
  }
});

const resolveSelection: (
  selection: typeof Selection.Type,
  targetCatalog: typeof TargetCatalog.Service,
  moduleCatalog: typeof ModuleCatalog.Service,
) => Effect.Effect<ResolutionState, BlueprintFailure | CatalogNotFound, never> =
  Effect.fn("BlueprintService.resolveSelection")(function* (
    selection: typeof Selection.Type,
    targetCatalog: typeof TargetCatalog.Service,
    moduleCatalog: typeof ModuleCatalog.Service,
  ) {
    const state: ResolutionState = {
      targets: new Map(),
      repoModules: new Map(),
      edges: new Map(),
    };

    const ensureRepoModule: (
      moduleId: typeof RepoModuleId.Type,
      options: {
        readonly selected: boolean;
        readonly cause: BlueprintCause;
      },
    ) => Effect.Effect<MutableRepoModuleState, CatalogNotFound, never> =
      Effect.fn(function* (
        moduleId: typeof RepoModuleId.Type,
        options: {
          readonly selected: boolean;
          readonly cause: BlueprintCause;
        },
      ) {
        yield* moduleCatalog.getRepoModuleDefinition(moduleId);

        const current = state.repoModules.get(moduleId);

        if (current !== undefined) {
          current.selected = current.selected || options.selected;
          appendCause(current.causes, options.cause);
          return current;
        }

        const next: MutableRepoModuleState = {
          moduleId,
          selected: options.selected,
          causes: [options.cause],
        };

        state.repoModules.set(moduleId, next);
        return next;
      });

    const ensureTarget: (
      identity: typeof TargetIdentity.Type,
      options: {
        readonly selected: boolean;
        readonly cause: BlueprintCause;
      },
    ) => Effect.Effect<
      MutableTargetState,
      BlueprintFailure | CatalogNotFound,
      never
    > = Effect.fn(function* (
      identity: typeof TargetIdentity.Type,
      options: {
        readonly selected: boolean;
        readonly cause: BlueprintCause;
      },
    ) {
      const id = toTargetId(identity);
      const current = state.targets.get(id);

      if (current !== undefined) {
        current.selected = current.selected || options.selected;
        appendCause(current.causes, options.cause);
        return current;
      }

      const targetDefinition = yield* targetCatalog.getTargetDefinition(
        identity.kind,
      );
      const targetState: MutableTargetState = {
        id,
        identity,
        selected: options.selected,
        causes: [options.cause],
        targetModules: new Map(),
      };

      state.targets.set(id, targetState);

      for (const repoModuleId of targetDefinition.requiredRepoModules) {
        const edge = appendEdge(state, {
          from: toTargetReference(id),
          to: toRepoModuleReference(repoModuleId),
          reason: "required-repo-module",
        });

        yield* ensureRepoModule(repoModuleId, {
          selected: false,
          cause: toDependencyCause(edge.id),
        });
      }

      return targetState;
    });

    const ensureTargetModule: (
      target: typeof TargetIdentity.Type,
      moduleId: typeof TargetModuleId.Type,
      options: {
        readonly selected: boolean;
        readonly cause: BlueprintCause;
      },
    ) => Effect.Effect<
      MutableTargetModuleState,
      BlueprintFailure | CatalogNotFound,
      never
    > = Effect.fn(function* (
      target: typeof TargetIdentity.Type,
      moduleId: typeof TargetModuleId.Type,
      options: {
        readonly selected: boolean;
        readonly cause: BlueprintCause;
      },
    ) {
      const targetId = toTargetId(target);
      const targetState = yield* ensureTarget(target, {
        selected: false,
        cause: options.cause,
      });
      const current = targetState.targetModules.get(moduleId);

      if (current !== undefined) {
        current.selected = current.selected || options.selected;
        appendCause(current.causes, options.cause);
        return current;
      }

      const targetModuleDefinition =
        yield* moduleCatalog.getTargetModuleDefinition(moduleId);

      if (!targetModuleDefinition.isSupported(target)) {
        yield* Effect.fail(
          new BlueprintFailure({
            message: `Unsupported target-module combination: ${targetId} requires module ${moduleId}`,
          }),
        );
      }

      const targetModuleState: MutableTargetModuleState = {
        moduleId,
        selected: options.selected,
        causes: [options.cause],
      };

      targetState.targetModules.set(moduleId, targetModuleState);
      const targetModuleReference = toTargetModuleReference(targetId, moduleId);
      const owningEdge = appendEdge(state, {
        from: targetModuleReference,
        to: toTargetReference(targetId),
        reason: "required-owning-target",
      });

      yield* ensureTarget(target, {
        selected: false,
        cause: toDependencyCause(owningEdge.id),
      });

      for (const dependency of targetModuleDefinition.dependencies) {
        if (dependency.requiredCanonicalTarget !== undefined) {
          const canonicalTargetId = toTargetId(
            dependency.requiredCanonicalTarget,
          );
          const canonicalTargetEdge = appendEdge(state, {
            from: targetModuleReference,
            to: toTargetReference(canonicalTargetId),
            reason: "required-canonical-target",
          });

          yield* ensureTarget(dependency.requiredCanonicalTarget, {
            selected: false,
            cause: toDependencyCause(canonicalTargetEdge.id),
          });
        }

        if (dependency.requiredTargetModule !== undefined) {
          const requiredTargetId = toTargetId(
            dependency.requiredTargetModule.target,
          );
          const requiredTargetModuleEdge = appendEdge(state, {
            from: targetModuleReference,
            to: toTargetModuleReference(
              requiredTargetId,
              dependency.requiredTargetModule.moduleId,
            ),
            reason: "required-target-module",
          });

          yield* ensureTargetModule(
            dependency.requiredTargetModule.target,
            dependency.requiredTargetModule.moduleId,
            {
              selected: false,
              cause: toDependencyCause(requiredTargetModuleEdge.id),
            },
          );
        }
      }

      return targetModuleState;
    });

    for (const target of [...selection.targets].sort((left, right) =>
      toTargetId(left.identity).localeCompare(toTargetId(right.identity)),
    )) {
      const targetId = toTargetId(target.identity);

      yield* ensureTarget(target.identity, {
        selected: true,
        cause: toSelectionCause(toTargetReference(targetId)),
      });

      for (const moduleSelection of [...target.modules].sort((left, right) =>
        left.id.localeCompare(right.id),
      )) {
        yield* ensureTargetModule(target.identity, moduleSelection.id, {
          selected: true,
          cause: toSelectionCause(
            toTargetModuleReference(targetId, moduleSelection.id),
          ),
        });
      }
    }

    for (const repoModuleId of [...selection.modules].sort((left, right) =>
      left.localeCompare(right),
    )) {
      yield* ensureRepoModule(repoModuleId, {
        selected: true,
        cause: toSelectionCause(toRepoModuleReference(repoModuleId)),
      });
    }

    return state;
  });

const buildGraph = (state: ResolutionState): ResolutionGraph => {
  const nodeReferences = [
    ...[...state.targets.values()].map((target) =>
      toTargetReference(target.id),
    ),
    ...[...state.repoModules.values()].map((repoModule) =>
      toRepoModuleReference(repoModule.moduleId),
    ),
    ...[...state.targets.values()].flatMap((target) =>
      [...target.targetModules.values()].map((targetModule) =>
        toTargetModuleReference(target.id, targetModule.moduleId),
      ),
    ),
  ].sort((left, right) =>
    toNodeReferenceKey(left).localeCompare(toNodeReferenceKey(right)),
  );

  const edges = [...state.edges.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  return Graph.directed<BlueprintNodeReference, BlueprintDependencyEdge>(
    (mutable) => {
      const nodeIndexes = new Map<string, number>();

      for (const reference of nodeReferences) {
        nodeIndexes.set(
          toNodeReferenceKey(reference),
          Graph.addNode(mutable, reference),
        );
      }

      for (const edge of edges) {
        const from = nodeIndexes.get(toNodeReferenceKey(edge.from));
        const to = nodeIndexes.get(toNodeReferenceKey(edge.to));

        if (from === undefined || to === undefined) {
          continue;
        }

        Graph.addEdge(mutable, from, to, edge);
      }
    },
  );
};

const getTargets = (state: ResolutionState): Array<ResolvedTarget> =>
  [...state.targets.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((target) => {
      const targetModules = [...target.targetModules.values()]
        .sort((left, right) => left.moduleId.localeCompare(right.moduleId))
        .map(
          (targetModule): ResolvedTargetModule => ({
            moduleId: targetModule.moduleId,
            status: targetModule.selected ? "selected" : "implied",
            causes: toSortedCauses(targetModule.causes),
          }),
        );

      return {
        id: target.id,
        identity: target.identity,
        status: target.selected ? "selected" : "implied",
        causes: toSortedCauses(target.causes),
        targetModules,
        composition:
          target.identity.kind === "package" &&
          target.targetModules.has("domain-api")
            ? {
                _tag: "package",
                publicEntrypoint: "./Api",
              }
            : undefined,
      };
    });

const getRepoModules = (state: ResolutionState): Array<ResolvedRepoModule> =>
  [...state.repoModules.keys()]
    .sort((left, right) => left.localeCompare(right))
    .map((repoModuleId) => ({
      moduleId: repoModuleId,
      status: state.repoModules.get(repoModuleId)?.selected
        ? "selected"
        : "implied",
      causes: toSortedCauses(state.repoModules.get(repoModuleId)?.causes ?? []),
    }));

const buildWarnings = (state: ResolutionState): Array<BlueprintWarning> => {
  const warnings: Array<BlueprintWarning> = [];

  for (const target of [...state.targets.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const warning = toRedundantSelectionWarning(
      toTargetReference(target.id),
      target.selected,
      target.causes,
    );

    if (warning !== undefined) {
      warnings.push(warning);
    }

    for (const targetModule of [...target.targetModules.values()].sort(
      (left, right) => left.moduleId.localeCompare(right.moduleId),
    )) {
      const targetModuleWarning = toRedundantSelectionWarning(
        toTargetModuleReference(target.id, targetModule.moduleId),
        targetModule.selected,
        targetModule.causes,
      );

      if (targetModuleWarning !== undefined) {
        warnings.push(targetModuleWarning);
      }
    }
  }

  for (const repoModule of [...state.repoModules.values()].sort((left, right) =>
    left.moduleId.localeCompare(right.moduleId),
  )) {
    const warning = toRedundantSelectionWarning(
      toRepoModuleReference(repoModule.moduleId),
      repoModule.selected,
      repoModule.causes,
    );

    if (warning !== undefined) {
      warnings.push(warning);
    }
  }

  return warnings.sort((left, right) =>
    toNodeReferenceKey(left.node).localeCompare(toNodeReferenceKey(right.node)),
  );
};

const toRedundantSelectionWarning = (
  node: BlueprintNodeReference,
  selected: boolean,
  causes: ReadonlyArray<BlueprintCause>,
): BlueprintWarning | undefined => {
  if (!selected) {
    return undefined;
  }

  const edgeIds = causes
    .filter((cause) => cause._tag === "dependency")
    .map((cause) => cause.edgeId)
    .sort((left, right) => left.localeCompare(right));

  if (edgeIds.length === 0) {
    return undefined;
  }

  return {
    _tag: "RedundantSelectionNormalized",
    node,
    edgeIds: edgeIds as [string, ...Array<string>],
  };
};

const appendEdge = (
  state: ResolutionState,
  edge: Omit<BlueprintDependencyEdge, "_tag" | "id">,
): BlueprintDependencyEdge => {
  const next: BlueprintDependencyEdge = {
    _tag: "depends-on",
    id: toEdgeId(edge.reason, edge.from, edge.to),
    from: edge.from,
    to: edge.to,
    reason: edge.reason,
  };

  const current = state.edges.get(next.id);

  if (current !== undefined) {
    return current;
  }

  state.edges.set(next.id, next);
  return next;
};

const appendCause = (
  causes: Array<BlueprintCause>,
  cause: BlueprintCause,
): void => {
  const causeKey = toCauseKey(cause);

  if (causes.some((current) => toCauseKey(current) === causeKey)) {
    return;
  }

  causes.push(cause);
};

const toSelectionCause = (source: BlueprintNodeReference): BlueprintCause => ({
  _tag: "selection",
  source,
});

const toDependencyCause = (edgeId: string): BlueprintCause => ({
  _tag: "dependency",
  edgeId,
});

const toTargetId = (identity: typeof TargetIdentity.Type): string =>
  identity.kind === "package"
    ? `packages/${identity.name}`
    : `apps/${identity.kind}-${identity.name}`;

const toTargetReference = (id: string): BlueprintNodeReference => ({
  _tag: "target",
  id,
});

const toRepoModuleReference = (
  id: typeof RepoModuleId.Type,
): BlueprintNodeReference => ({
  _tag: "repo-module",
  id,
});

const toTargetModuleReference = (
  targetId: string,
  moduleId: typeof TargetModuleId.Type,
): BlueprintNodeReference => ({
  _tag: "target-module",
  targetId,
  moduleId,
});

const toNodeReferenceKey = (reference: BlueprintNodeReference): string => {
  switch (reference._tag) {
    case "target":
      return `target:${reference.id}`;
    case "repo-module":
      return `repo-module:${reference.id}`;
    case "target-module":
      return `target-module:${reference.targetId}:${reference.moduleId}`;
  }
};

const toEdgeId = (
  reason: BlueprintDependencyEdge["reason"],
  from: BlueprintNodeReference,
  to: BlueprintNodeReference,
): string =>
  `${reason}=>${toNodeReferenceKey(from)}=>${toNodeReferenceKey(to)}`;

const toCauseKey = (cause: BlueprintCause): string => {
  switch (cause._tag) {
    case "selection":
      return `selection:${toNodeReferenceKey(cause.source)}`;
    case "dependency":
      return `dependency:${cause.edgeId}`;
  }
};

const toSortedCauses = (
  causes: ReadonlyArray<BlueprintCause>,
): [BlueprintCause, ...Array<BlueprintCause>] =>
  [...causes].sort((left, right) =>
    toCauseKey(left).localeCompare(toCauseKey(right)),
  ) as [BlueprintCause, ...Array<BlueprintCause>];
