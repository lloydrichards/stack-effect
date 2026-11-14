import type { TargetIdentity } from "@repo/domain/Catalog";
import {
  supports,
  type CatalogModel,
  type SelectionProjection,
} from "./selection";

type Module = CatalogModel["modules"][number];
export const moduleParents = (model: CatalogModel, moduleId: string) =>
  model.modules.filter((parent) =>
    parent.children?.some((child) => child.moduleId === moduleId),
  );
export const targetEntryModules = (
  model: CatalogModel,
  owner: TargetIdentity,
) =>
  model.modules.filter(
    (module) =>
      module.visibility !== "internal" &&
      supports(module, owner) &&
      !moduleParents(model, module.id).some((parent) =>
        supports(parent, owner),
      ),
  );

/** Discovery policy only: dependency closure remains the Selection projection's responsibility. */
export const moduleAccessReason = (
  model: CatalogModel,
  projection: SelectionProjection,
  module: Module,
  owner?: TargetIdentity,
) => {
  if (module.visibility === "internal")
    return "Added automatically when required; no separate selection is needed.";
  const parents = moduleParents(model, module.id).filter(
    (parent) => !owner || supports(parent, owner),
  );
  if (!parents.length) return undefined;
  if (!owner)
    return "Choose this feature beneath its parent in the target’s module tree.";
  const available = parents.some(
    (parent) =>
      parent.children?.some(
        (child) =>
          child.moduleId === module.id && child.requirement === "optional",
      ) &&
      projection.modules.some(
        (entry) =>
          entry.module.id === parent.id &&
          (!owner || entry.owner.toKey() === owner.toKey()),
      ),
  );
  return available
    ? undefined
    : `Enable this feature under ${parents.map((parent) => parent.title).join(" or ")} first. Required features are added automatically.`;
};
