import { relationshipIslands } from "./module-relationships";
import {
  type CatalogModel,
  type SelectionProjection,
  type WorkingSelection,
  supportedKinds,
  ownerLabel,
  type Decision,
} from "./selection";
import type { Direction } from "./selection-url";
import { variantConfig } from "./variants";
export type CanvasNode = {
  id: string;
  visualId?: string | undefined;
  title: string;
  subtitle: string;
  source: string;
  moduleId?: string;
  kind: string;
  status: "target" | "explicit" | "automatic" | "catalog" | "pending";
  x: number;
  y: number;
  width: number;
  height: number;
  minY: number;
  maxY: number;
  decision?: Decision;
  discovery?: import("./discovery-flow").DiscoveryTier | undefined;
};
export type CanvasGroup = {
  kind: string;
  title: string;
  source: string;
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
};
export type CanvasLayout = {
  variant: Direction;
  nodes: CanvasNode[];
  groups: CanvasGroup[];
  catalogY: number;
  modulesY: number;
  width: number;
  height: number;
};

export const prototypeLayout = (
  model: CatalogModel,
  working: WorkingSelection,
  projection: SelectionProjection,
  direction: Direction,
): CanvasLayout => {
  const active =
    projection.modules.length > 0 ||
    working.picks.length > 0 ||
    projection.targets.length > 0;
  const selectedIds = new Set(
    projection.modules.map((m) => String(m.module.id)),
  );
  working.picks.forEach((p) => selectedIds.add(p.moduleId));
  const unplaced = working.picks.filter(
    (p) =>
      !projection.modules.some(
        (m) =>
          m.explicit &&
          m.module.id === p.moduleId &&
          (!p.owner || m.owner.toKey() === p.owner.toKey()),
      ),
  );
  const roots = projection.links
    .filter((l) => l.from.startsWith("target:"))
    .map((l) => l.to);
  const levels = new Map(roots.map((id) => [id, 0]));
  Array.from({ length: projection.modules.length }).forEach(() =>
    projection.links.forEach((l) => {
      const depth = levels.get(l.from);
      if (
        depth !== undefined &&
        !l.to.startsWith("target:") &&
        !levels.has(l.to)
      )
        levels.set(l.to, depth + 1);
    }),
  );
  const moduleRows = new Map<number, string[]>();
  projection.modules.forEach((m) => {
    const level = Math.min(8, levels.get(m.id) ?? 0);
    moduleRows.set(level, [...(moduleRows.get(level) ?? []), m.id]);
  });
  const rowHeights = Array.from(
    { length: Math.max(1, ...moduleRows.keys()) + 1 },
    (_, level) =>
      Math.max(
        1,
        Math.ceil(
          ((direction === "bands"
            ? Math.max(
                0,
                ...projection.targets.map(
                  (owner) =>
                    projection.modules.filter(
                      (module) =>
                        module.owner.toKey() === owner.toKey() &&
                        (levels.get(module.id) ?? 0) === level,
                    ).length,
                ),
              ) * 2
            : (moduleRows.get(level)?.length ?? 0)) +
            (level === 0 ? unplaced.length : 0)) /
            6,
        ),
      ) * (direction === "bands" ? 460 : 260),
  );
  const targetRows =
    direction === "bands"
      ? 1
      : Math.max(1, Math.ceil(projection.targets.length / 6));
  const modulesY = 240 + targetRows * 100;
  const rowY = (level: number) =>
    modulesY + rowHeights.slice(0, level).reduce((a, b) => a + b, 0);
  const pendingY = modulesY + 20 + rowHeights.reduce((a, b) => a + b, 0);
  const catalogY = active
    ? pendingY +
      Math.ceil(Math.max(1, projection.decisions.length) / 6) * 100 +
      300
    : 70;
  const base = { minY: modulesY - 25, maxY: catalogY - 90 };
  const nodes: CanvasNode[] = [
    ...projection.targets.map((owner, i): CanvasNode => ({
      id: `target:${owner.toKey()}`,
      title: ownerLabel(owner),
      subtitle: "Selected target",
      source: model.source("target", owner.kind),
      kind: owner.kind,
      status: "target",
      x: 55 + (direction === "bands" ? i * 1600 : (i % 6) * 245),
      y: direction === "bands" ? 60 : 60 + Math.floor(i / 6) * 100,
      width: 220,
      height: 64,
      minY: 40,
      maxY: 60 + (targetRows - 1) * 100 + 15,
    })),
    ...projection.modules.map((m): CanvasNode => {
      const level = Math.min(8, levels.get(m.id) ?? 0),
        row = moduleRows.get(level) ?? [],
        i = row.indexOf(m.id);
      const siblings = projection.modules.filter(
        (entry) =>
          entry.owner.toKey() === m.owner.toKey() &&
          (levels.get(entry.id) ?? 0) === level,
      );
      const localIndex = siblings.findIndex((entry) => entry.id === m.id);
      const targetIndex = projection.targets.findIndex(
        (owner) => owner.toKey() === m.owner.toKey(),
      );
      return {
        id: m.id,
        title: m.module.title,
        subtitle: ownerLabel(m.owner),
        source: model.source("module", m.module.id),
        moduleId: m.module.id,
        kind: m.owner.kind,
        status: m.explicit ? "explicit" : "automatic",
        x:
          direction === "bands"
            ? 55 +
              targetIndex * 1600 +
              ((localIndex % 3) - (Math.min(3, siblings.length) - 1) / 2) * 430
            : 55 + (i % 6) * 245,
        y:
          rowY(level) +
          (direction === "bands"
            ? Math.floor(localIndex / 3) * 460
            : Math.floor(i / 6) * 260),
        width: 220,
        height: 78,
        ...base,
      };
    }),
    ...unplaced.map((p, i): CanvasNode => ({
      id: `intent:${p.id}`,
      title:
        model.modules.find((m) => m.id === p.moduleId)?.title ?? p.moduleId,
      subtitle: "Selected · choose a target",
      source: model.source("module", p.moduleId),
      moduleId: p.moduleId,
      kind: p.kind,
      status: "explicit",
      x: 55 + ((i + (moduleRows.get(0)?.length ?? 0)) % 6) * 245,
      y: rowY(0) + Math.floor((i + (moduleRows.get(0)?.length ?? 0)) / 6) * 260,
      width: 220,
      height: 78,
      ...base,
    })),
    ...projection.decisions.map((d, i): CanvasNode => ({
      id: d.id,
      title: d.title,
      subtitle:
        d.type === "provider"
          ? `${d.providers.length} eligible providers`
          : "Target decision",
      source: "Pending",
      kind: d.type === "provider" ? d.owner.kind : d.kind,
      status: "pending",
      x: 55 + (i % 6) * 245,
      y: pendingY + Math.floor(i / 6) * 100,
      width: 220,
      height: 72,
      minY: pendingY - 10,
      maxY: catalogY - 80,
      decision: d,
    })),
  ];
  const grouped = model.targets.map((t) => ({
    target: t,
    modules: model.modules.filter((m) => supportedKinds(m)[0] === t.kind),
  }));
  const config = variantConfig(direction);
  const columns = config.columns || Math.max(1, grouped.length);
  const groups = grouped.map((g, i): CanvasGroup => ({
    kind: g.target.kind,
    title: g.target.title,
    source: model.source("target", g.target.kind),
    x:
      850 +
      (i % columns) * config.spacing +
      (config.columns && Math.floor(i / columns) % 2 ? 450 : 0),
    y:
      catalogY +
      (direction === "lanes" ? 400 : 800) +
      Math.floor(i / columns) * 1700,
    width: 0,
    height: 0,
    count: model.modules.filter((m) =>
      supportedKinds(m).some((kind) => kind === g.target.kind),
    ).length,
  }));
  const catalogNodes = groups.flatMap((group, groupIndex) =>
    grouped[groupIndex]!.modules.filter((m) => !selectedIds.has(m.id)).map(
      (m, i): CanvasNode => {
        const angle = i * 2.399963;
        const radius = 180 + Math.sqrt(i + 1) * 80;
        return {
          id: `catalog:${m.id}`,
          title: m.title,
          subtitle: m.visibility === "internal" ? "Internal module" : m.id,
          source: model.source("module", m.id),
          moduleId: m.id,
          kind: group.kind,
          status: "catalog",
          x: group.x + Math.cos(angle) * radius - 130,
          y:
            group.y +
            (direction === "lanes" ? 500 : 0) +
            Math.sin(angle) * radius -
            48,
          width: 260,
          height: 96,
          minY: catalogY + 100,
          maxY: Number.POSITIVE_INFINITY,
        };
      },
    ),
  );
  const islands = relationshipIslands(model);
  const freeModules = islands.flatMap((modules, island) =>
    modules
      .filter((m) => !selectedIds.has(m.id))
      .map((m, i): CanvasNode => {
        const angle = i * 2.399963;
        const radius = 220 + Math.sqrt(i + 1) * 190;
        const centerX =
          1300 + (island % 3) * 2300 + (Math.floor(island / 3) % 2 ? 500 : 0);
        const centerY = catalogY + 1300 + Math.floor(island / 3) * 2400;
        return {
          id: `catalog:${m.id}`,
          title: m.title,
          subtitle: supportedKinds(m).join(" · "),
          source: model.source("module", m.id),
          moduleId: m.id,
          kind: supportedKinds(m)[0] ?? "",
          status: "catalog",
          x: centerX + Math.cos(angle) * radius - 130,
          y: centerY + Math.sin(angle) * radius - 48,
          width: 260,
          height: 96,
          minY: catalogY + 100,
          maxY: Number.POSITIVE_INFINITY,
        };
      }),
  );
  const remaining = direction === "bands" ? freeModules : catalogNodes;
  return {
    variant: direction,
    nodes: [
      ...nodes.map((node) => ({ ...node, x: node.x + 1000 })),
      ...remaining,
    ],
    groups: direction === "bands" ? [] : groups,
    catalogY,
    modulesY,
    width: Math.max(
      3000,
      ...nodes.map((n) => n.x + 1900),
      ...remaining.map((n) => n.x + 900),
    ),
    height: Math.max(catalogY + 1300, ...remaining.map((n) => n.y + 1100)),
  };
};
