import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { discoveryFlow, type DiscoveryAnchor } from "./discovery-flow";
import type { CanvasLayout, CanvasNode, CanvasGroup } from "./layout";
import { moduleAccessReason, targetEntryModules } from "./module-hierarchy";
import { moduleRelationships } from "./module-relationships";
import { previousNodeBody } from "./node-continuity";
import {
  supportedKinds,
  supports,
  type CatalogModel,
  type SelectionProjection,
} from "./selection";
import { variantConfig } from "./variants";

export type ForceBody = SimulationNodeDatum & {
  id: string;
  visualId: string;
  kind: string;
  status: CanvasNode["status"] | "hub";
  x: number;
  y: number;
  vx: number;
  vy: number;
  anchorX: number;
  anchorY: number;
  radius: number;
  discovery?: DiscoveryAnchor | undefined;
  node?: CanvasNode;
  group?: CanvasGroup;
};
type ForceEdge = SimulationLinkDatum<ForceBody> & {
  length: number;
  strength: number;
};
export type ForceBond = {
  from: string;
  to: string;
  type: "support" | "dependency" | "bridge";
};
const inCatalog = (body: ForceBody) =>
  body.status === "catalog" || body.status === "hub";
export const createOrganicWorld = (
  layout: CanvasLayout,
  model: CatalogModel,
  projection: SelectionProjection,
  previous: ReadonlyMap<string, ForceBody> = new Map(),
  catalogShift = 0,
) => {
  const config = variantConfig(layout.variant);
  const bodies: ForceBody[] = [
    ...layout.nodes.map((node): ForceBody => {
      const old = previousNodeBody(node, layout, previous);
      return {
        id: node.id,
        visualId: old?.visualId ?? node.id,
        kind: node.kind,
        status: node.status,
        x: old?.x ?? node.x + node.width / 2,
        y: old?.y ?? node.y + node.height / 2,
        vx: old?.vx ?? 0,
        vy: old?.vy ?? 0,
        anchorX: node.x + node.width / 2,
        anchorY: node.y + node.height / 2,
        radius: node.status === "target" ? 135 : 195,
        node,
      };
    }),
    ...layout.groups.map((group): ForceBody => {
      const old = previous.get(`hub:${group.kind}`);
      return {
        id: `hub:${group.kind}`,
        visualId: `hub:${group.kind}`,
        kind: group.kind,
        status: "hub",
        x: old?.x ?? group.x,
        y: old ? old.y + catalogShift : group.y,
        vx: 0,
        vy: 0,
        anchorX: old?.anchorX ?? group.x,
        anchorY: old ? old.anchorY + catalogShift : group.y,
        radius: 140,
        group,
      };
    }),
  ];
  const index = new Map(bodies.map((body) => [body.id, body]));
  const updateDiscovery = (focused = "") => {
    const anchors = discoveryFlow(layout, model, projection, focused);
    bodies.forEach((body) => {
      body.discovery = anchors.get(body.id);
    });
  };
  updateDiscovery();
  const bonds: ForceBond[] = [
    ...model.modules.flatMap((m) =>
      supportedKinds(m).map((kind) => ({
        from: `catalog:${m.id}`,
        to: `hub:${kind}`,
        type: "support" as const,
      })),
    ),
    ...moduleRelationships(model).map((link) => ({
      from: `catalog:${link.from}`,
      to: `catalog:${link.to}`,
      type: "dependency" as const,
    })),
    ...projection.links.map((l) => ({
      from: l.from,
      to: l.to,
      type: "dependency" as const,
    })),
    ...(layout.variant === "bands"
      ? projection.modules.flatMap((parent) =>
          (parent.module.children ?? []).flatMap((child) => {
            const module = model.modules.find(
              (entry) => entry.id === child.moduleId,
            );
            return child.requirement === "optional" &&
              module &&
              supports(module, parent.owner) &&
              !moduleAccessReason(model, projection, module, parent.owner)
              ? [
                  {
                    from: parent.id,
                    to: `catalog:${child.moduleId}`,
                    type: "bridge" as const,
                  },
                ]
              : [];
          }),
        )
      : []),
    ...projection.targets.flatMap((owner) =>
      layout.variant === "bands"
        ? targetEntryModules(model, owner).map((module) => ({
            from: `target:${owner.toKey()}`,
            to: `catalog:${module.id}`,
            type: "bridge" as const,
          }))
        : [
            {
              from: `target:${owner.toKey()}`,
              to: `hub:${owner.kind}`,
              type: "bridge" as const,
            },
          ],
    ),
  ].filter((bond) => index.has(bond.from) && index.has(bond.to));
  const makeSimulation = (scope: "catalog" | "selection") => {
    const scoped = bodies.filter(
      (body) => inCatalog(body) === (scope === "catalog"),
    );
    const ids = new Set(scoped.map((body) => body.id));
    // Bridges explain provenance across the two diagrams, but exert no force.
    const links: ForceEdge[] = bonds
      .filter(
        (bond) =>
          bond.type !== "bridge" && ids.has(bond.from) && ids.has(bond.to),
      )
      .map((bond) => ({
        source: bond.from,
        target: bond.to,
        length:
          scope === "selection" ? 380 : bond.type === "support" ? 300 : 420,
        strength:
          scope === "selection"
            ? bond.from.replace("target:", "").split("#")[0] ===
              bond.to.replace("target:", "").split("#")[0]
              ? 0.14
              : 0.025
            : bond.type === "support"
              ? index.get(bond.from)?.kind === index.get(bond.to)?.kind
                ? 0.17
                : layout.variant === "bands"
                  ? 0.06
                  : 0.025
              : layout.variant === "bands"
                ? index.get(bond.from)?.discovery?.tier !==
                  index.get(bond.to)?.discovery?.tier
                  ? 0.008
                  : 0.045
                : 0.004,
      }));
    return forceSimulation<ForceBody>(scoped)
      .alphaDecay(0.014)
      .alphaMin(0.002)
      .velocityDecay(0.28)
      .force(
        "charge",
        forceManyBody<ForceBody>()
          .strength((body) => (body.status === "hub" ? -650 : -180))
          .distanceMax(1200),
      )
      .force(
        "links",
        forceLink<ForceBody, ForceEdge>(links)
          .id((body) => body.id)
          .distance((link) => link.length)
          .strength((link) => link.strength),
      )
      .force(
        "collision",
        forceCollide<ForceBody>()
          .radius((body) => body.radius)
          .strength(0.95)
          .iterations(3),
      )
      .force("layout", (alpha) =>
        scoped.forEach((body) => {
          const hub = index.get(`hub:${body.kind}`);
          const x =
            scope === "catalog" &&
            body.status !== "hub" &&
            layout.variant === "lanes"
              ? (hub?.x ?? body.anchorX)
              : (body.discovery?.x ?? body.anchorX);
          const strengthX =
            scope === "selection"
              ? body.status === "target"
                ? 0.14
                : 0.065
              : body.status === "hub"
                ? config.hubX
                : body.discovery
                  ? 0.045
                  : config.moduleX;
          const strengthY =
            scope === "selection"
              ? body.status === "target"
                ? 0.18
                : 0.065
              : body.status === "hub"
                ? config.hubY
                : body.discovery
                  ? 0.14
                  : 0.004;
          body.vx += (x - body.x) * strengthX * alpha;
          body.vy +=
            ((body.discovery?.y ?? body.anchorY) - body.y) * strengthY * alpha;
          if (scope === "catalog" && body.y < layout.catalogY + 180)
            body.vy += (layout.catalogY + 180 - body.y) * 0.06 * alpha;
          if (scope === "selection" && body.y > layout.catalogY - 180)
            body.vy -= (body.y - layout.catalogY + 180) * 0.025 * alpha;
        }),
      )
      .force("motion-limit", () =>
        scoped.forEach((body) => {
          const speed = Math.hypot(body.vx, body.vy);
          if (speed > 42) {
            body.vx *= 42 / speed;
            body.vy *= 42 / speed;
          }
        }),
      )
      .stop();
  };
  const catalogSimulation = makeSimulation("catalog");
  const selectionSimulation = makeSimulation("selection");
  const simulations = [catalogSimulation, selectionSimulation];
  const simulationFor = (id: string) => {
    const body = index.get(id);
    return body && inCatalog(body) ? catalogSimulation : selectionSimulation;
  };
  const snapshot = () => ({
    nodes: bodies.flatMap((body) =>
      body.node
        ? [
            {
              ...body.node,
              visualId: body.visualId,
              discovery: body.discovery?.tier,
              x: body.x - body.node.width / 2,
              y: body.y - body.node.height / 2,
            },
          ]
        : [],
    ),
    hubs: bodies.flatMap((body) =>
      body.group ? [{ ...body.group, x: body.x, y: body.y, id: body.id }] : [],
    ),
  });
  return {
    focusDiscovery: (focused: string) => {
      updateDiscovery(focused);
      catalogSimulation.alpha(0.65);
    },
    bodies: index,
    bonds,
    catalogSimulation,
    selectionSimulation,
    simulations,
    simulationFor,
    snapshot,
  };
};
