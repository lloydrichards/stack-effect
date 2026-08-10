import type { BuilderCatalogOutputWire } from "../../worker/recipe-preview-protocol";
import type {
  CatalogModule,
  SupportConfiguration,
  SupportSelection,
  TargetInstance,
  TargetModuleRequirement,
} from "./recipe-builder-form";

export type ModuleRelationshipNode = {
  readonly owner: { readonly kind: string; readonly name: string };
  readonly module: CatalogModule;
  readonly requirement: "required" | "optional";
  readonly children: ReadonlyArray<ModuleRelationshipNode>;
  readonly configuration?: SupportConfiguration;
};

export function descendantIds(
  module: CatalogModule,
  modules: ReadonlyArray<CatalogModule>,
): ReadonlySet<string> {
  const direct = module.children.map((child) => child.moduleId);
  return new Set(
    direct.flatMap((id) => {
      const child = modules.find((candidate) => candidate.id === id);
      return [id, ...(child ? descendantIds(child, modules) : [])];
    }),
  );
}

export function buildModuleRelationshipNodes(
  root: CatalogModule,
  rootOwner: { readonly kind: string; readonly name: string },
  catalog: BuilderCatalogOutputWire | undefined,
): ReadonlyArray<ModuleRelationshipNode> {
  if (catalog === undefined) return [];
  const visited = new Set([`${ownerKey(rootOwner)}#${root.id}`]);
  const modulesFor = (owner: {
    readonly kind: string;
    readonly name: string;
  }) =>
    catalog.targetModules.find(
      (entry) => ownerKey(entry.owner) === ownerKey(owner),
    )?.modules ?? [];
  const resolve = (
    owner: { readonly kind: string; readonly name: string },
    moduleId: string,
  ) => modulesFor(owner).find((module) => module.id === moduleId);
  const childrenFor = (
    module: CatalogModule,
    owner: { readonly kind: string; readonly name: string },
    includeModuleChildren = true,
  ): ReadonlyArray<ModuleRelationshipNode> => {
    const configuration = module.children.length
      ? { owner, parent: module, modules: modulesFor(owner) }
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
      ...module.implications.flatMap((implication) => {
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
      const key = `${ownerKey(candidate.owner)}#${candidate.moduleId}`;
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

export function addModuleImplications(
  targets: ReadonlyArray<TargetInstance>,
  sourceTargetId: string,
  sourceModule: CatalogModule,
  catalog: BuilderCatalogOutputWire,
  nextId: () => number,
): ReadonlyArray<TargetInstance> {
  return sourceModule.implications.reduce((current, implication) => {
    const definition = catalog.targets.find(
      (candidate) => candidate.kind === implication.targetKind,
    );
    if (definition === undefined) return current;
    const candidates = current.filter(
      (target) => target.kind === definition.kind,
    );
    if (candidates.length > 1) return current;
    const existing = candidates[0];
    const name = existing?.name ?? definition.defaultName ?? definition.kind;
    const dependencyOwned =
      existing?.requirements?.some(
        (candidate) =>
          candidate.moduleId === implication.moduleId && candidate.addedModule,
      ) ?? false;
    const requirement: TargetModuleRequirement = {
      sourceTargetId,
      sourceModuleId: sourceModule.id,
      moduleId: implication.moduleId,
      addedModule:
        dependencyOwned || !existing?.modules.includes(implication.moduleId),
    };
    if (existing) {
      return current.map((target) =>
        target.id === existing.id
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

export function removeModuleImplications(
  targets: ReadonlyArray<TargetInstance>,
  sourceTargetId: string,
  sourceModuleId: string,
): ReadonlyArray<TargetInstance> {
  return targets.flatMap((target) => {
    const removed = (target.requirements ?? []).filter(
      (requirement) =>
        requirement.sourceTargetId === sourceTargetId &&
        requirement.sourceModuleId === sourceModuleId,
    );
    if (removed.length === 0) return [target];
    const requirements = (target.requirements ?? []).filter(
      (requirement) => !removed.includes(requirement),
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
  const withoutImplications = (removed?.modules ?? []).reduce(
    (current, moduleId) => removeModuleImplications(current, id, moduleId),
    targets,
  );
  const withoutSources = (removed?.requirements ?? []).reduce(
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
    withoutImplications,
  );
  return withoutSources.filter((target) => target.id !== id);
}

export function removeModuleSupportSelections(
  selections: ReadonlyArray<SupportSelection>,
  target: Pick<TargetInstance, "kind" | "name">,
  module: CatalogModule,
  modules: ReadonlyArray<CatalogModule>,
): ReadonlyArray<SupportSelection> {
  const removedParentIds = new Set([
    module.id,
    ...descendantIds(module, modules),
  ]);
  return selections.filter(
    (selection) =>
      ownerKey(selection.owner) !== ownerKey(target) ||
      !removedParentIds.has(selection.parent.id),
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

export function nextTargetName(
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
  definition: BuilderCatalogOutputWire["targets"][number],
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
  module: CatalogModule,
  modules: ReadonlyArray<CatalogModule>,
  catalog: BuilderCatalogOutputWire,
  nextId: () => number,
): ReadonlyArray<TargetInstance> {
  const selected = target.modules.includes(module.id);
  const descendants = descendantIds(module, modules);
  const updated = targets.map((candidate) =>
    candidate.id === target.id
      ? {
          ...candidate,
          modules: selected
            ? candidate.modules.filter(
                (moduleId) =>
                  moduleId !== module.id && !descendants.has(moduleId),
              )
            : [...candidate.modules, module.id],
        }
      : candidate,
  );
  return selected
    ? removeModuleImplications(updated, target.id, module.id)
    : addModuleImplications(updated, target.id, module, catalog, nextId);
}

export function toggleSupportSelection(
  selections: ReadonlyArray<SupportSelection>,
  configuration: SupportConfiguration,
  module: CatalogModule,
): ReadonlyArray<SupportSelection> {
  const key = supportConfigurationKey(configuration);
  const existing = selections.find(
    (selection) => supportConfigurationKey(selection) === key,
  );
  const selected = existing?.selected ?? [];
  const nextSelected = selected.includes(module.id)
    ? selected.filter((moduleId) => moduleId !== module.id)
    : [...selected, module.id];
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

export function mergeTargetInstances(
  targets: ReadonlyArray<TargetInstance>,
): ReadonlyArray<TargetInstance> {
  return Array.from(
    targets
      .reduce((merged, target) => {
        const key = targetKey(target);
        const existing = merged.get(key);
        merged.set(
          key,
          existing
            ? {
                ...existing,
                modules: Array.from(
                  new Set([...existing.modules, ...target.modules]),
                ),
              }
            : target,
        );
        return merged;
      }, new Map<string, TargetInstance>())
      .values(),
  );
}

export function supportConfigurationKey(
  configuration: Pick<SupportConfiguration, "owner" | "parent">,
): string {
  return `${ownerKey(configuration.owner)}#${configuration.parent.id}`;
}

export function uniqueOwners(
  owners: ReadonlyArray<{ readonly kind: string; readonly name: string }>,
): ReadonlyArray<{ readonly kind: string; readonly name: string }> {
  return Array.from(
    new Map(owners.map((owner) => [ownerKey(owner), owner])).values(),
  );
}

export function targetNameError(
  target: TargetInstance,
  targets: ReadonlyArray<TargetInstance>,
): string | undefined {
  if (!/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(target.name))
    return "Use lowercase letters, numbers, and single hyphens.";
  if (
    targets.some(
      (candidate) =>
        candidate.id !== target.id &&
        candidate.kind === target.kind &&
        candidate.name === target.name,
    )
  )
    return "Target names must be unique within a target kind.";
  return undefined;
}

export function ownerKey(owner: {
  readonly kind: string;
  readonly name: string;
}): string {
  return `${owner.kind}/${owner.name}`;
}

export function targetKey(target: TargetInstance): string {
  return ownerKey(target);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unknown preview error occurred.";
}
