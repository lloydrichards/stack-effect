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
import {
  blueprintCauseOrd,
  blueprintDependencyEdgeOrd,
  blueprintNodeReferenceOrd,
} from "@repo/domain/Order";
import type {
  RepoModuleId,
  TargetIdentity,
  TargetModuleId,
} from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import {
  Array as Arr,
  Context,
  Effect,
  Graph,
  Layer,
  Match,
  Order,
  Result,
} from "effect";
import { ModuleCatalog } from "../catalog/ModuleCatalog";
import { TargetCatalog } from "../catalog/TargetCatalog";
import {
  repoModuleIdOrd,
  selectionTargetModuleOrd,
  selectionTargetOrd,
} from "./planOrders";

type MutableTargetState = {
  readonly id: string;
  readonly identity: typeof TargetIdentity.Type;
  selected: boolean;
  readonly causes: Arr.NonEmptyArray<BlueprintCause>;
  readonly targetModules: Map<
    typeof TargetModuleId.Type,
    MutableTargetModuleState
  >;
};

type MutableTargetModuleState = {
  readonly moduleId: typeof TargetModuleId.Type;
  selected: boolean;
  readonly causes: Arr.NonEmptyArray<BlueprintCause>;
};

type MutableRepoModuleState = {
  readonly moduleId: typeof RepoModuleId.Type;
  selected: boolean;
  readonly causes: Arr.NonEmptyArray<BlueprintCause>;
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

      const resolve = Effect.fn("BlueprintService.resolve")(function* (
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
        const edges = Arr.map(
          Arr.fromIterable(graph.edges.values()),
          (edge) => edge.data,
        );

        return new Blueprint({
          nodes,
          edges,
          modules,
          warnings,
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
  },
);

const resolveSelection = Effect.fn("BlueprintService.resolveSelection")(
  function* (
    selection: typeof Selection.Type,
    targetCatalog: typeof TargetCatalog.Service,
    moduleCatalog: typeof ModuleCatalog.Service,
  ) {
    const state = {
      targets: new Map<string, MutableTargetState>(),
      repoModules: new Map<typeof RepoModuleId.Type, MutableRepoModuleState>(),
      edges: new Map<string, BlueprintDependencyEdge>(),
    } satisfies ResolutionState;

    const ensureRepoModule = Effect.fn(function* (
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
        causes: Arr.make(options.cause),
      };

      state.repoModules.set(moduleId, next);
      return next;
    });

    const ensureTarget = Effect.fn(function* (
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
        causes: Arr.make(options.cause),
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
        causes: Arr.make(options.cause),
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

    for (const target of Arr.sort(selection.targets, selectionTargetOrd)) {
      const targetId = toTargetId(target.identity);

      yield* ensureTarget(target.identity, {
        selected: true,
        cause: toSelectionCause(toTargetReference(targetId)),
      });

      for (const moduleSelection of Arr.sort(
        target.modules,
        selectionTargetModuleOrd,
      )) {
        yield* ensureTargetModule(target.identity, moduleSelection.id, {
          selected: true,
          cause: toSelectionCause(
            toTargetModuleReference(targetId, moduleSelection.id),
          ),
        });
      }
    }

    for (const repoModuleId of Arr.sort(selection.modules, repoModuleIdOrd)) {
      yield* ensureRepoModule(repoModuleId, {
        selected: true,
        cause: toSelectionCause(toRepoModuleReference(repoModuleId)),
      });
    }

    return state;
  },
);

const buildGraph = (state: ResolutionState) => {
  const nodeReferences = Arr.sort(
    Arr.appendAll(
      Arr.appendAll(
        Arr.map(Arr.fromIterable(state.targets.values()), (target) =>
          toTargetReference(target.id),
        ),
        Arr.map(Arr.fromIterable(state.repoModules.values()), (repoModule) =>
          toRepoModuleReference(repoModule.moduleId),
        ),
      ),
      Arr.flatMap(Arr.fromIterable(state.targets.values()), (target) =>
        Arr.map(
          Arr.fromIterable(target.targetModules.values()),
          (targetModule) =>
            toTargetModuleReference(target.id, targetModule.moduleId),
        ),
      ),
    ),
    blueprintNodeReferenceOrd,
  );

  const edges = Arr.sort(state.edges.values(), blueprintDependencyEdgeOrd);

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
  Arr.map(Arr.fromIterable(state.targets.values()), (target) => {
    const targetModules = Arr.map(
      Arr.fromIterable(target.targetModules.values()),
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
  Arr.map(Arr.fromIterable(state.repoModules.values()), (repoModule) => ({
    moduleId: repoModule.moduleId,
    status: repoModule.selected ? "selected" : "implied",
    causes: toSortedCauses(repoModule.causes),
  }));

const buildWarnings = (state: ResolutionState): Array<BlueprintWarning> => {
  const warnings: Array<BlueprintWarning> = [];

  for (const target of state.targets.values()) {
    const warning = toRedundantSelectionWarning(
      toTargetReference(target.id),
      target.selected,
      target.causes,
    );

    if (warning !== undefined) {
      warnings.push(warning);
    }

    for (const targetModule of target.targetModules.values()) {
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

  for (const repoModule of state.repoModules.values()) {
    const warning = toRedundantSelectionWarning(
      toRepoModuleReference(repoModule.moduleId),
      repoModule.selected,
      repoModule.causes,
    );

    if (warning !== undefined) {
      warnings.push(warning);
    }
  }

  return warnings;
};

const toRedundantSelectionWarning = (
  node: BlueprintNodeReference,
  selected: boolean,
  causes: Arr.NonEmptyReadonlyArray<BlueprintCause>,
): BlueprintWarning | undefined => {
  if (!selected) {
    return undefined;
  }

  const edgeIds = Arr.sort(
    Arr.filterMap(causes, (cause) =>
      cause._tag === "dependency"
        ? Result.succeed(cause.edgeId)
        : Result.failVoid,
    ),
    Order.String,
  );

  if (!Arr.isReadonlyArrayNonEmpty(edgeIds)) {
    return undefined;
  }

  return {
    _tag: "RedundantSelectionNormalized",
    node,
    edgeIds,
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
  causes: Arr.NonEmptyArray<BlueprintCause>,
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

const toTargetId = (identity: typeof TargetIdentity.Type) =>
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

const toNodeReferenceKey = (reference: BlueprintNodeReference) =>
  Match.value(reference).pipe(
    Match.tag("target", (reference) => `target:${reference.id}`),
    Match.tag("repo-module", (reference) => `repo-module:${reference.id}`),
    Match.tag(
      "target-module",
      (reference) =>
        `target-module:${reference.targetId}:${reference.moduleId}`,
    ),
    Match.exhaustive,
  );

const toEdgeId = (
  reason: BlueprintDependencyEdge["reason"],
  from: BlueprintNodeReference,
  to: BlueprintNodeReference,
) => `${reason}=>${toNodeReferenceKey(from)}=>${toNodeReferenceKey(to)}`;

const toCauseKey = (cause: BlueprintCause) =>
  Match.value(cause).pipe(
    Match.tag(
      "selection",
      (cause) => `selection:${toNodeReferenceKey(cause.source)}`,
    ),
    Match.tag("dependency", (cause) => `dependency:${cause.edgeId}`),
    Match.exhaustive,
  );

const toSortedCauses = (causes: Arr.NonEmptyReadonlyArray<BlueprintCause>) =>
  Arr.sort(causes, blueprintCauseOrd);
