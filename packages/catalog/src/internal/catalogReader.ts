import type {
  CatalogEdge,
  CatalogGraph,
  CatalogFragment,
  ModuleCapability,
  ModuleCategory,
  ModuleDefinition,
  ModuleId,
  TargetKind,
  Visibility,
} from "@repo/domain/Catalog";
import {
  CatalogNotFound,
  CatalogTree,
  ModuleDependency,
  TargetIdentity,
} from "@repo/domain/Catalog";
import { Array as Arr, Context, Effect, Graph, Option } from "effect";
import type {
  BuilderCatalog,
  BuilderCatalogModule,
  CatalogOrigins,
} from "../Catalog";
import { dependencyTarget, supportedOnTargetKind } from "./definitionTargets";

const hasVisibility = (
  definition: { visibility?: Visibility },
  visibility: Visibility | undefined,
) =>
  visibility === undefined ||
  (definition.visibility ?? "public") === visibility;

const moduleSupportsTargetKind = (mod: ModuleDefinition, kind: TargetKind) =>
  Arr.some(
    mod.supportedOn,
    (supportedOn) => supportedOnTargetKind(supportedOn) === kind,
  );

// A missing node means the reference is invalid; composition reports it.
const edge = (
  from: number | undefined,
  to: number | undefined,
  kind: CatalogEdge,
) => ({ from, to, kind });

/** @internal */
export const CatalogDefinitions = Context.Service<
  CatalogFragment & { readonly origins?: CatalogOrigins | undefined }
>("@repo/catalog/CatalogDefinitions");

/** @internal */
export const makeCatalogReader = Effect.gen(function* () {
  const {
    targets: targetRegistry,
    modules: moduleRegistry,
    origins,
  } = yield* CatalogDefinitions;
  const targetIndex = new Map(targetRegistry.map((t) => [t.kind, t]));
  const moduleIndex = new Map(moduleRegistry.map((m) => [m.id, m]));

  const allImplications = Arr.flatMap(
    moduleRegistry,
    (def) => def.implies ?? [],
  );

  const getTarget = Effect.fn("CatalogReader.getTarget")(function* (
    kind: TargetKind,
  ) {
    return yield* Effect.fromNullishOr(targetIndex.get(kind)).pipe(
      Effect.mapError(
        () =>
          new CatalogNotFound({
            catalog: "target",
            entity: "target-kind",
            id: kind,
          }),
      ),
    );
  });

  const getModule = Effect.fn("CatalogReader.getModule")(function* (
    moduleId: ModuleId,
  ) {
    return yield* Effect.fromNullishOr(moduleIndex.get(moduleId)).pipe(
      Effect.mapError(
        () =>
          new CatalogNotFound({
            catalog: "module",
            entity: "module",
            id: moduleId,
          }),
      ),
    );
  });

  const isSupportedOn = Effect.fn("CatalogReader.isSupportedOn")(function* (
    moduleId: ModuleId,
    target: TargetIdentity,
  ) {
    const definition = yield* getModule(moduleId);
    return Arr.some(definition.supportedOn, (supportedOn) =>
      target.matches(supportedOn),
    );
  });

  const isImpliedByAny = (moduleId: ModuleId, targetKind: TargetKind) =>
    Effect.succeed(
      Arr.some(
        allImplications,
        (imp) => imp.moduleId === moduleId && imp.targetKind === targetKind,
      ),
    ).pipe(Effect.withSpan("CatalogReader.isImpliedByAny"));

  const getImplications = Effect.fn("CatalogReader.getImplications")(function* (
    moduleIds: ReadonlyArray<ModuleId>,
  ) {
    const definitions = yield* Effect.forEach(moduleIds, getModule);
    return new Set(
      Arr.flatMap(definitions, (def) =>
        Arr.map(
          def.implies ?? [],
          (imp) => `${imp.targetKind}:${imp.moduleId}`,
        ),
      ),
    );
  });

  const getTargetKinds = (options?: { visibility?: Visibility }) =>
    Arr.map(
      Arr.filter(Arr.fromIterable(targetIndex.values()), (target) =>
        hasVisibility(target, options?.visibility),
      ),
      (target) => target.kind,
    );

  const getSupportedModules = Effect.fn("CatalogReader.getSupportedModules")(
    function* (kind: TargetKind, options?: { visibility?: Visibility }) {
      yield* getTarget(kind);
      return Arr.filter(
        Arr.fromIterable(moduleIndex.values()),
        (mod) =>
          moduleSupportsTargetKind(mod, kind) &&
          hasVisibility(mod, options?.visibility),
      );
    },
  );

  // Mirrors composition: a definition may reference its own source or one
  // its source declares in `requires`.
  const canReference = (ownerId: ModuleId, referencedId: ModuleId) => {
    const owner = origins?.modules.get(ownerId);
    const referenced = origins?.modules.get(referencedId);
    return (
      owner === undefined ||
      referenced === undefined ||
      owner === referenced ||
      (origins?.requires.get(owner) ?? []).includes(referenced)
    );
  };

  const getCapabilityProviders = (options: {
    capability: ModuleCapability;
    target: TargetIdentity;
    visibility?: Visibility;
    requestingModuleId?: ModuleId;
  }) =>
    Arr.filter(
      moduleRegistry,
      (mod) =>
        Arr.contains(mod.provides ?? [], options.capability) &&
        hasVisibility(mod, options.visibility) &&
        Arr.some(mod.supportedOn, (supportedOn) =>
          options.target.matches(supportedOn),
        ) &&
        (options.requestingModuleId === undefined ||
          canReference(options.requestingModuleId, mod.id)),
    );

  const toBuilderCatalog = Effect.fn("CatalogReader.toBuilderCatalog")(
    function* (
      owners: ReadonlyArray<TargetIdentity>,
    ): Effect.fn.Return<BuilderCatalog, CatalogNotFound> {
      const supportedModules = (owner: TargetIdentity) =>
        Arr.filter(Arr.fromIterable(moduleIndex.values()), (module) =>
          Arr.some(module.supportedOn, (supportedOn) =>
            owner.matches(supportedOn),
          ),
        );
      const ownerKey = (owner: TargetIdentity) => `${owner.kind}/${owner.name}`;
      const expandOwners = (
        pending: ReadonlyArray<TargetIdentity>,
        expanded = new Map<string, TargetIdentity>(),
      ): ReadonlyArray<TargetIdentity> => {
        const [owner, ...remaining] = pending;
        if (owner === undefined) return Arr.fromIterable(expanded.values());
        if (expanded.has(ownerKey(owner)))
          return expandOwners(remaining, expanded);

        expanded.set(ownerKey(owner), owner);
        const modules = supportedModules(owner);
        const dependencyOwners = Arr.flatMap(modules, (module) =>
          Arr.map(module.dependencies, dependencyTarget),
        );
        const implicationOwners = modules
          .flatMap((module) => module.implies ?? [])
          .flatMap((implication) => {
            const existing = [...owners, ...expanded.values()].find(
              (candidate) => candidate.kind === implication.targetKind,
            );
            if (existing !== undefined) return [existing];
            const definition = targetIndex.get(implication.targetKind);
            if (definition === undefined) return [];
            return [
              new TargetIdentity({
                kind: definition.kind,
                name: definition.defaultName ?? definition.kind,
              }),
            ];
          });
        return expandOwners(
          [...remaining, ...dependencyOwners, ...implicationOwners],
          expanded,
        );
      };
      const expandedOwners = expandOwners(owners);
      const projectModules = (owner: TargetIdentity) => {
        const modules = supportedModules(owner);
        const supportedIds = new Set(Arr.map(modules, (module) => module.id));
        return Arr.map(modules, (module): BuilderCatalogModule => ({
          id: module.id,
          title: module.title,
          description: module.description,
          visibility: module.visibility ?? "public",
          supportedRuntimes: module.supportedRuntimes,
          dependencies: module.dependencies,
          implies: module.implies ?? [],
          conflictsWith: module.conflictsWith ?? [],
          children: Arr.filter(module.children ?? [], (child) =>
            supportedIds.has(child.moduleId),
          ),
        }));
      };

      yield* Effect.forEach(expandedOwners, (owner) => getTarget(owner.kind), {
        discard: true,
      });

      return {
        targets: Arr.map(
          Arr.filter(Arr.fromIterable(targetIndex.values()), (target) =>
            hasVisibility(target, "public"),
          ),
          (target) => ({
            kind: target.kind,
            title: target.title,
            description: target.description,
            defaultName: target.defaultName,
            requiredModules: target.requiredModules ?? [],
          }),
        ),
        targetModules: Arr.map(expandedOwners, (owner) => ({
          owner,
          modules: projectModules(owner),
        })),
      };
    },
  );

  const toGraph: CatalogGraph = Graph.directed((graph) => {
    const targetNodes = new Map(
      targetRegistry.map((definition) => [
        definition.kind,
        Graph.addNode(graph, { _tag: "target", definition }),
      ]),
    );
    const moduleNodes = moduleRegistry.map((definition) => ({
      definition,
      node: Graph.addNode(graph, { _tag: "module", definition }),
    }));
    const moduleNodeById = new Map(
      moduleNodes.map(({ definition, node }) => [definition.id, node]),
    );

    const edges = moduleNodes.flatMap(({ definition, node }) => [
      ...definition.supportedOn.map((supported) =>
        edge(
          node,
          targetNodes.get(supportedOnTargetKind(supported)),
          "supportedOn",
        ),
      ),
      ...definition.dependencies
        .filter(ModuleDependency.guards["required-module"])
        .map((dependency) =>
          edge(node, moduleNodeById.get(dependency.moduleId), "requiredModule"),
        ),
      ...(definition.implies ?? []).map((implication) =>
        edge(node, moduleNodeById.get(implication.moduleId), "implies"),
      ),
      // Child edges point to parents so graph consumers can traverse childOf relationships directly.
      ...(definition.children ?? []).map((child) =>
        edge(moduleNodeById.get(child.moduleId), node, "childOf"),
      ),
    ]);
    for (const { from, to, kind } of edges) {
      if (from !== undefined && to !== undefined)
        Graph.addEdge(graph, from, to, kind);
    }
  });

  const getModules = (options?: {
    category?: ModuleCategory;
    visibility?: Visibility;
  }): ReadonlyArray<ModuleDefinition> =>
    Arr.filter(
      Arr.fromIterable(moduleIndex.values()),
      (mod) =>
        (options?.category === undefined ||
          Arr.contains(mod.categories ?? [], options.category)) &&
        hasVisibility(mod, options?.visibility),
    );

  const toCatalogTree = CatalogTree.make({
    targets: Arr.map(Arr.fromIterable(targetIndex.values()), (target) => ({
      kind: target.kind,
      title: target.title,
      description: target.description,
      requiredModules: target.requiredModules ?? [],
      modules: Arr.fromIterable(moduleIndex.values())
        .filter((mod) => moduleSupportsTargetKind(mod, target.kind))
        .map((mod) => ({
          id: mod.id,
          title: mod.title,
          description: mod.description,
          categories: mod.categories ?? [],
          requires: mod.dependencies
            .filter(ModuleDependency.guards["required-module"])
            .map((dependency) => ({
              targetKind: dependency.target.kind,
              targetName: dependency.target.name,
              moduleId: dependency.moduleId,
            })),
          requiredCapabilities: mod.dependencies
            .filter(ModuleDependency.guards["required-capability"])
            .map((dependency) => ({
              targetKind: dependency.target.kind,
              targetName: dependency.target.name,
              capability: dependency.capability,
            })),
          provides: mod.provides ?? [],
          implies: (mod.implies ?? []).map((imp) => ({
            targetKind: imp.targetKind,
            moduleId: imp.moduleId,
          })),
          conflictsWith: mod.conflictsWith ?? [],
        })),
    })),
  });

  const getSource = (
    subject: { _tag: "target"; kind: string } | { _tag: "module"; id: string },
  ) =>
    Option.fromUndefinedOr(
      subject._tag === "target"
        ? origins?.targets.get(subject.kind)
        : origins?.modules.get(subject.id),
    );

  return {
    getImplications,
    getSource,
    getCapabilityProviders,
    getModules,
    getModule,
    getSupportedModules,
    getTarget,
    getTargetKinds,
    toBuilderCatalog,
    isSupportedOn,
    isImpliedByAny,
    toCatalogTree,
    toGraph,
  };
});
