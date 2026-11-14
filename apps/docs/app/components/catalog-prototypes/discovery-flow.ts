import type { CanvasLayout } from "./layout";
import { moduleAccessReason, moduleParents } from "./module-hierarchy";
import { moduleRelationships } from "./module-relationships";
import {
  supports,
  type CatalogModel,
  type SelectionProjection,
} from "./selection";

export type DiscoveryTier = "next" | "available" | "related" | "distant";
export type DiscoveryAnchor = { x: number; y: number; tier: DiscoveryTier };

/** Soft destinations within the catalog; these never exert force on selected nodes. */
export const discoveryFlow = (
  layout: CanvasLayout,
  model: CatalogModel,
  projection: SelectionProjection,
  focused = "",
): ReadonlyMap<string, DiscoveryAnchor> => {
  if (layout.variant !== "bands" || !projection.targets.length)
    return new Map();
  const selected = new Set(
    projection.modules.map((entry) => String(entry.module.id)),
  );
  const relationships = moduleRelationships(model);
  const focusNode = layout.nodes.find(
    (node) => node.id === focused && node.status !== "catalog",
  );
  const owners = focusNode
    ? projection.targets.filter((owner) => owner.kind === focusNode.kind)
    : projection.targets;
  const candidates = layout.nodes
    .filter((node) => node.status === "catalog")
    .map((node) => {
      const module = model.modules.find((entry) => entry.id === node.moduleId)!;
      const eligible = projection.targets.filter((owner) =>
        supports(module, owner),
      );
      const available = eligible.some(
        (owner) =>
          !moduleAccessReason(model, projection, module, owner) &&
          !projection.modules.some(
            (entry) =>
              entry.owner.toKey() === owner.toKey() &&
              (module.conflictsWith?.includes(entry.module.id) ||
                entry.module.conflictsWith?.includes(module.id)),
          ),
      );
      const next = available && moduleParents(model, module.id).length > 0;
      const related =
        eligible.length > 0 ||
        relationships.some(
          (link) =>
            (link.from === module.id && selected.has(link.to)) ||
            (link.to === module.id && selected.has(link.from)),
        );
      const tier: DiscoveryTier = next
        ? "next"
        : available
          ? "available"
          : related
            ? "related"
            : "distant";
      return {
        node,
        tier,
        ownerId: eligible
          .find(
            (owner) => !moduleAccessReason(model, projection, module, owner),
          )
          ?.toKey(),
        focused: owners.some((owner) => supports(module, owner)),
      };
    });
  const ready = candidates
    .filter((entry) => entry.tier === "next" || entry.tier === "available")
    .sort(
      (left, right) =>
        Number(right.tier === "next") - Number(left.tier === "next") ||
        Number(right.focused) - Number(left.focused) ||
        left.node.id.localeCompare(right.node.id),
    );
  const selectedNodes = layout.nodes.filter(
    (node) => node.status !== "catalog",
  );
  const centerX = focusNode
    ? focusNode.x + focusNode.width / 2
    : selectedNodes.reduce((sum, node) => sum + node.x + node.width / 2, 0) /
      Math.max(1, selectedNodes.length);
  const columns = Math.min(3, Math.max(1, ready.length));
  const backgroundY =
    layout.catalogY + 350 + Math.ceil(ready.length / columns) * 460 + 850;
  return new Map(
    candidates.map(({ node, tier, ownerId }) => {
      const peers = ready.filter((entry) => entry.ownerId === ownerId);
      const position = peers.findIndex((entry) => entry.node.id === node.id);
      const ownerNode = layout.nodes.find(
        (entry) => entry.id === `target:${ownerId}`,
      );
      const groupCenter = ownerNode
        ? ownerNode.x + ownerNode.width / 2
        : centerX;
      const groupColumns = Math.min(columns, Math.max(1, peers.length));
      return [
        node.id,
        position >= 0
          ? {
              tier,
              x:
                groupCenter +
                ((position % groupColumns) - (groupColumns - 1) / 2) * 470 +
                Math.sin(position * 2.4) * 45,
              y:
                layout.catalogY +
                350 +
                Math.floor(position / groupColumns) * 460 +
                Math.cos(position * 2.4) * 35,
            }
          : {
              tier,
              x: node.x + node.width / 2,
              y:
                backgroundY +
                (tier === "distant" ? 1400 : 0) +
                Math.max(0, node.y - layout.catalogY) * 0.7,
            },
      ];
    }),
  );
};
