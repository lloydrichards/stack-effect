import {
  CatalogModule,
  RecipeBuilderCatalog,
} from "../../../workers/recipe-builder/domain";
import {
  ownerKey,
  type SupportConfiguration,
  type SupportSelection,
  type TargetInstance,
  type TargetModuleRequirement,
} from "../form";

type Owner = SupportConfiguration["owner"];

export type InfrastructureSelection = "none" | "cloudflare";

const cloudflareTargetReason =
  "This first Alchemy/Cloudflare slice supports only Client React and requires exactly one target.";
const cloudflareAdditionalReactTargetReason =
  "This first Alchemy/Cloudflare slice supports exactly one Client React target; remove the selected React target before adding another.";
const cloudflareModuleReason =
  "This backend-dependent module is not supported by the first Alchemy/Cloudflare static React slice.";

export function infrastructureTargetDisabledReason(
  infrastructure: InfrastructureSelection,
  targetKind: string,
  selectedTargets: ReadonlyArray<Pick<TargetInstance, "kind">> = [],
): string | undefined {
  if (infrastructure !== "cloudflare") return undefined;
  if (targetKind !== "client-react") return cloudflareTargetReason;
  return selectedTargets.some((target) => target.kind === "client-react")
    ? cloudflareAdditionalReactTargetReason
    : undefined;
}

export function infrastructureModuleDisabledReason(
  infrastructure: InfrastructureSelection,
  moduleId: string,
): string | undefined {
  if (infrastructure !== "cloudflare") return undefined;
  return moduleId === "config-typescript-vite" ||
    moduleId === "client-react-web-worker" ||
    moduleId === "client-react-devtools"
    ? undefined
    : cloudflareModuleReason;
}

const moduleKey = (owner: Owner, moduleId: string) =>
  `${ownerKey(owner)}#${moduleId}`;

export function moduleRequiresCapability(
  root: typeof CatalogModule.Type,
  rootOwner: Owner,
  capability: string,
  catalog: typeof RecipeBuilderCatalog.Type | undefined,
): boolean {
  if (catalog === undefined) return false;
  const modulesByOwner = new Map(
    catalog.targetModules.map(({ owner, modules }) => [
      ownerKey(owner),
      new Map(modules.map((module) => [module.id, module])),
    ]),
  );
  const visited = new Set<string>();
  const visit = (module: typeof CatalogModule.Type, owner: Owner): boolean => {
    const key = moduleKey(owner, module.id);
    if (visited.has(key)) return false;
    visited.add(key);
    if (
      module.dependencies.some(
        (dependency) =>
          dependency._tag === "required-capability" &&
          dependency.capability === capability,
      )
    ) {
      return true;
    }
    const requiredModules = module.dependencies.flatMap((dependency) =>
      dependency._tag === "required-module"
        ? [
            {
              owner: dependency.target,
              module: modulesByOwner
                .get(ownerKey(dependency.target))
                ?.get(dependency.moduleId),
            },
          ]
        : [],
    );
    const impliedModules = module.implies.flatMap((implication) => {
      const entry = catalog.targetModules.find(
        ({ owner: candidate, modules }) =>
          candidate.kind === implication.targetKind &&
          modules.some(({ id }) => id === implication.moduleId),
      );
      return entry
        ? [
            {
              owner: entry.owner,
              module: entry.modules.find(
                ({ id }) => id === implication.moduleId,
              ),
            },
          ]
        : [];
    });
    const requiredChildren = module.children.flatMap((child) =>
      child.requirement === "required"
        ? [
            {
              owner,
              module: modulesByOwner.get(ownerKey(owner))?.get(child.moduleId),
            },
          ]
        : [],
    );
    return [...requiredModules, ...impliedModules, ...requiredChildren].some(
      (candidate) =>
        candidate.module !== undefined &&
        visit(candidate.module, candidate.owner),
    );
  };
  return visit(root, rootOwner);
}

export type ModuleRelationshipNode = {
  readonly owner: Owner;
  readonly module: typeof CatalogModule.Type;
  readonly requirement: "required" | "optional";
  readonly children: ReadonlyArray<ModuleRelationshipNode>;
  readonly configuration?: SupportConfiguration;
};

function descendantIds(
  module: typeof CatalogModule.Type,
  modules: ReadonlyArray<typeof CatalogModule.Type>,
): ReadonlySet<string> {
  const modulesById = new Map<string, typeof CatalogModule.Type>(
    modules.map((candidate) => [candidate.id, candidate]),
  );
  const descendants = new Set<string>();
  const visit = (moduleId: string) => {
    if (descendants.has(moduleId)) return;
    descendants.add(moduleId);
    modulesById
      .get(moduleId)
      ?.children.forEach((child) => visit(child.moduleId));
  };
  module.children.forEach((child) => visit(child.moduleId));
  return descendants;
}

export function buildModuleRelationshipNodes(
  root: typeof CatalogModule.Type,
  rootOwner: Owner,
  catalog: typeof RecipeBuilderCatalog.Type | undefined,
): ReadonlyArray<ModuleRelationshipNode> {
  if (catalog === undefined) return [];
  const visited = new Set([moduleKey(rootOwner, root.id)]);
  const modulesByOwner = new Map(
    catalog.targetModules.map(({ owner, modules }) => [
      ownerKey(owner),
      {
        modules,
        modulesById: new Map<string, typeof CatalogModule.Type>(
          modules.map((module) => [module.id, module]),
        ),
      },
    ]),
  );
  const resolve = (owner: Owner, moduleId: string) =>
    modulesByOwner.get(ownerKey(owner))?.modulesById.get(moduleId);
  const childrenFor = (
    module: typeof CatalogModule.Type,
    owner: Owner,
    includeModuleChildren = true,
  ): ReadonlyArray<ModuleRelationshipNode> => {
    const configuration = module.children.length
      ? { owner, parentId: module.id }
      : undefined;
    const candidates = [
      ...module.dependencies.flatMap((dependency) =>
        dependency._tag === "required-module"
          ? [
              {
                owner: dependency.target,
                moduleId: dependency.moduleId,
                requirement: "required" as const,
              },
            ]
          : [],
      ),
      ...module.implies.flatMap((implication) => {
        const target = catalog.targets.find(
          (candidate) => candidate.kind === implication.targetKind,
        );
        return target
          ? [
              {
                owner: {
                  kind: target.kind,
                  name: target.defaultName ?? target.kind,
                },
                moduleId: implication.moduleId,
                requirement: "required" as const,
              },
            ]
          : [];
      }),
      ...(includeModuleChildren
        ? module.children.map((child) => ({
            owner,
            moduleId: child.moduleId,
            requirement: child.requirement,
            ...(child.requirement === "optional" && configuration
              ? { configuration }
              : {}),
          }))
        : []),
    ];
    return candidates.flatMap((candidate) => {
      const key = moduleKey(candidate.owner, candidate.moduleId);
      if (visited.has(key)) return [];
      const child = resolve(candidate.owner, candidate.moduleId);
      if (child === undefined) return [];
      visited.add(key);
      return [
        {
          owner: candidate.owner,
          module: child,
          requirement: candidate.requirement,
          children: childrenFor(child, candidate.owner),
          ...("configuration" in candidate
            ? { configuration: candidate.configuration }
            : {}),
        },
      ];
    });
  };
  return childrenFor(root, rootOwner, false);
}

function addModuleImplications(
  targets: ReadonlyArray<TargetInstance>,
  sourceTargetId: string,
  sourceModule: typeof CatalogModule.Type,
  catalog: typeof RecipeBuilderCatalog.Type,
  nextId: () => number,
): ReadonlyArray<TargetInstance> {
  return sourceModule.implies.reduce((current, implication) => {
    const definition = catalog.targets.find(
      (candidate) => candidate.kind === implication.targetKind,
    );
    if (definition === undefined) return current;
    const matchingTargets = current.filter(
      (target) => target.kind === definition.kind,
    );
    if (matchingTargets.length > 1) return current;
    const existingTarget = matchingTargets[0];
    const name =
      existingTarget?.name ?? definition.defaultName ?? definition.kind;
    const moduleAlreadySelected =
      existingTarget?.modules.includes(implication.moduleId) ?? false;
    const moduleWasDependencyAdded =
      existingTarget?.requirements?.some(
        (candidate) =>
          candidate.moduleId === implication.moduleId && candidate.addedModule,
      ) ?? false;
    const requirement: TargetModuleRequirement = {
      sourceTargetId,
      sourceModuleId: sourceModule.id,
      moduleId: implication.moduleId,
      addedModule: moduleWasDependencyAdded || !moduleAlreadySelected,
    };
    if (existingTarget) {
      return current.map((target) =>
        target.id === existingTarget.id
          ? {
              ...target,
              modules: Array.from(
                new Set([...target.modules, implication.moduleId]),
              ),
              requirements: [...(target.requirements ?? []), requirement],
            }
          : target,
      );
    }
    return [
      ...current,
      {
        id: `implied-${definition.kind}-${nextId()}`,
        kind: definition.kind,
        name,
        modules: [implication.moduleId],
        requirements: [requirement],
        addedByDependency: true,
      },
    ];
  }, targets);
}

function removeModuleImplications(
  targets: ReadonlyArray<TargetInstance>,
  sourceTargetId: string,
  sourceModuleId: string,
): ReadonlyArray<TargetInstance> {
  return targets.flatMap((target) => {
    const comesFromSource = (requirement: TargetModuleRequirement) =>
      requirement.sourceTargetId === sourceTargetId &&
      requirement.sourceModuleId === sourceModuleId;
    const removed = (target.requirements ?? []).filter(comesFromSource);
    if (removed.length === 0) return [target];
    const requirements = (target.requirements ?? []).filter(
      (requirement) => !comesFromSource(requirement),
    );
    const removableModules = new Set(
      removed
        .filter(
          (requirement) =>
            requirement.addedModule &&
            !requirements.some(
              (remaining) => remaining.moduleId === requirement.moduleId,
            ),
        )
        .map((requirement) => requirement.moduleId),
    );
    const modules = target.modules.filter(
      (moduleId) => !removableModules.has(moduleId),
    );
    if (target.addedByDependency && modules.length === 0) return [];
    return requirements.length === 0
      ? [{ ...target, modules, requirements, addedByDependency: undefined }]
      : [{ ...target, modules, requirements }];
  });
}

export function removeTargetAndDependencies(
  targets: ReadonlyArray<TargetInstance>,
  id: string,
): ReadonlyArray<TargetInstance> {
  const removed = targets.find((target) => target.id === id);
  const afterDownstreamCleanup = (removed?.modules ?? []).reduce(
    (current, moduleId) => removeModuleImplications(current, id, moduleId),
    targets,
  );
  const afterUpstreamCleanup = (removed?.requirements ?? []).reduce(
    (current, requirement) =>
      removeModuleImplications(
        current.map((target) =>
          target.id === requirement.sourceTargetId
            ? {
                ...target,
                modules: target.modules.filter(
                  (moduleId) => moduleId !== requirement.sourceModuleId,
                ),
              }
            : target,
        ),
        requirement.sourceTargetId,
        requirement.sourceModuleId,
      ),
    afterDownstreamCleanup,
  );
  return afterUpstreamCleanup.filter((target) => target.id !== id);
}

export function removeModuleSupportSelections(
  selections: ReadonlyArray<SupportSelection>,
  target: Pick<TargetInstance, "kind" | "name">,
  module: typeof CatalogModule.Type,
  modules: ReadonlyArray<typeof CatalogModule.Type>,
): ReadonlyArray<SupportSelection> {
  const targetOwnerKey = ownerKey(target);
  const removedParentIds = new Set([
    module.id,
    ...descendantIds(module, modules),
  ]);
  return selections.filter(
    (selection) =>
      ownerKey(selection.owner) !== targetOwnerKey ||
      !removedParentIds.has(selection.parentId),
  );
}

export function removeTargetSupportSelections(
  selections: ReadonlyArray<SupportSelection>,
  removedTargets: ReadonlyArray<Pick<TargetInstance, "kind" | "name">>,
): ReadonlyArray<SupportSelection> {
  const removedOwners = new Set(removedTargets.map(ownerKey));
  return selections.filter(
    (selection) => !removedOwners.has(ownerKey(selection.owner)),
  );
}

function nextTargetName(
  baseName: string,
  targets: ReadonlyArray<Pick<TargetInstance, "kind" | "name">>,
  kind: string,
): string {
  const usedNames = new Set(
    targets
      .filter((target) => target.kind === kind)
      .map((target) => target.name),
  );
  if (!usedNames.has(baseName)) return baseName;
  return (
    Array.from({ length: usedNames.size + 1 }, (_, index) => index + 2)
      .map((suffix) => (baseName ? `${baseName}-${suffix}` : `${suffix}`))
      .find((candidate) => !usedNames.has(candidate)) ??
    `${baseName}-${usedNames.size + 2}`
  );
}

export function makeTargetInstance(
  id: string,
  definition: (typeof RecipeBuilderCatalog.Type)["targets"][number],
  targets: ReadonlyArray<TargetInstance>,
): TargetInstance {
  const baseName = definition.defaultName ?? definition.kind;
  return {
    id,
    kind: definition.kind,
    name: nextTargetName(baseName, targets, definition.kind),
    modules: definition.requiredModules,
  };
}

export function toggleTargetModule(
  targets: ReadonlyArray<TargetInstance>,
  target: TargetInstance,
  module: typeof CatalogModule.Type,
  modules: ReadonlyArray<typeof CatalogModule.Type>,
  catalog: typeof RecipeBuilderCatalog.Type,
  nextId: () => number,
): ReadonlyArray<TargetInstance> {
  const selected = target.modules.includes(module.id);
  if (!selected) {
    const updated = targets.map((candidate) =>
      candidate.id === target.id
        ? { ...candidate, modules: [...candidate.modules, module.id] }
        : candidate,
    );
    return addModuleImplications(updated, target.id, module, catalog, nextId);
  }

  const descendants = descendantIds(module, modules);
  const updated = targets.map((candidate) =>
    candidate.id === target.id
      ? {
          ...candidate,
          modules: candidate.modules.filter(
            (moduleId) => moduleId !== module.id && !descendants.has(moduleId),
          ),
        }
      : candidate,
  );
  return removeModuleImplications(updated, target.id, module.id);
}

export function toggleSupportSelection(
  selections: ReadonlyArray<SupportSelection>,
  configuration: SupportConfiguration,
  moduleId: string,
): ReadonlyArray<SupportSelection> {
  const key = supportConfigurationKey(configuration);
  const existing = selections.find(
    (selection) => supportConfigurationKey(selection) === key,
  );
  const selected = existing?.selected ?? [];
  const nextSelected = selected.includes(moduleId)
    ? selected.filter((selectedId) => selectedId !== moduleId)
    : [...selected, moduleId];
  return [
    ...selections.filter(
      (selection) => supportConfigurationKey(selection) !== key,
    ),
    { ...configuration, selected: nextSelected },
  ];
}

export function dependencySourceNames(
  target: TargetInstance,
  targets: ReadonlyArray<TargetInstance>,
): ReadonlyArray<string> {
  return Array.from(
    new Set(
      (target.requirements ?? []).flatMap((requirement) => {
        const source = targets.find(
          (candidate) => candidate.id === requirement.sourceTargetId,
        );
        return source ? [`${source.kind}/${source.name}`] : [];
      }),
    ),
  );
}

export function supportConfigurationKey(
  configuration: SupportConfiguration,
): string {
  return `${ownerKey(configuration.owner)}#${configuration.parentId}`;
}
