import type { CatalogService } from "@repo/catalog";
import { Graph, Option } from "effect";

export const relationshipKinds = [
  "supports",
  "requires",
  "implies",
  "child",
  "conflicts",
  "provider",
] as const;
export type RelationshipKind = (typeof relationshipKinds)[number];
export type ExplorerNode = {
  id: string;
  title: string;
  description: string;
  kind: "target" | "module";
  cluster: string;
  source: string;
  details: string;
};
export type ExplorerEdge = {
  source: string;
  target: string;
  kind: RelationshipKind;
  label: string;
};
export type ExplorerGraph = { nodes: ExplorerNode[]; edges: ExplorerEdge[] };

export const buildExplorerGraph = (
  catalog: typeof CatalogService.Service,
): ExplorerGraph => {
  const definitions = Array.from(
    Graph.entries(Graph.nodes(catalog.toGraph)),
    ([, node]) => node,
  );
  const nodes = definitions.map((node): ExplorerNode => {
    const d = node.definition;
    const id =
      node._tag === "target" ? node.definition.kind : node.definition.id;
    const cluster =
      node._tag === "target"
        ? node.definition.kind
        : node.definition.supportedOn[0]?._tag === "kind"
          ? node.definition.supportedOn[0].kind
          : node._tag === "module" &&
              node.definition.supportedOn[0]?._tag === "identity"
            ? node.definition.supportedOn[0].identity.kind
            : "other";
    return {
      id: `${node._tag}:${id}`,
      kind: node._tag,
      title: d.title,
      description: d.description,
      cluster,
      source: Option.getOrElse(
        catalog.getSource(
          node._tag === "target"
            ? { _tag: "target", kind: id }
            : { _tag: "module", id },
        ),
        () => "catalog",
      ),
      details: JSON.stringify(
        node._tag === "target"
          ? {
              visibility: node.definition.visibility,
              requiredModules: node.definition.requiredModules,
            }
          : {
              visibility: node.definition.visibility,
              supportedOn: node.definition.supportedOn,
              provides: node.definition.provides,
              dependencies: node.definition.dependencies,
            },
        null,
        2,
      ),
    };
  });
  const edge = (
    source: string,
    target: string,
    kind: RelationshipKind,
    label: string,
  ): ExplorerEdge => ({ source, target, kind, label });
  const edges = definitions.flatMap((node): ExplorerEdge[] =>
    node._tag === "target"
      ? (node.definition.requiredModules ?? []).map((id) =>
          edge(
            `target:${node.definition.kind}`,
            `module:${id}`,
            "requires",
            "Required by target",
          ),
        )
      : (() => {
          const m = node.definition;
          const from = `module:${m.id}`;
          return [
            ...m.supportedOn.map((rule) =>
              edge(
                from,
                `target:${rule._tag === "kind" ? rule.kind : rule.identity.kind}`,
                "supports",
                rule._tag === "kind"
                  ? `Supports ${rule.kind}`
                  : `Supports ${rule.identity.kind}/${rule.identity.name}`,
              ),
            ),
            ...m.dependencies.flatMap((dep) =>
              dep._tag === "required-target"
                ? [
                    edge(
                      from,
                      `target:${dep.identity.kind}`,
                      "requires",
                      `Requires target ${dep.identity.kind}/${dep.identity.name}`,
                    ),
                  ]
                : dep._tag === "required-module"
                  ? [
                      edge(
                        from,
                        `module:${dep.moduleId}`,
                        "requires",
                        `Requires on ${dep.target.kind}/${dep.target.name}`,
                      ),
                    ]
                  : catalog
                      .getModules()
                      .filter(
                        (provider) =>
                          (provider.provides ?? []).includes(dep.capability) &&
                          provider.supportedOn.some((rule) =>
                            dep.target.matches(rule),
                          ),
                      )
                      .map((provider) =>
                        edge(
                          from,
                          `module:${provider.id}`,
                          "provider",
                          `Candidate for ${dep.capability} on ${dep.target.kind}/${dep.target.name}; choose one provider`,
                        ),
                      ),
            ),
            ...(m.implies ?? []).map((imp) =>
              edge(
                from,
                `module:${imp.moduleId}`,
                "implies",
                `Implies on ${imp.targetKind}`,
              ),
            ),
            ...(m.children ?? []).map((child) =>
              edge(
                from,
                `module:${child.moduleId}`,
                "child",
                `${child.requirement} child`,
              ),
            ),
            ...(m.conflictsWith ?? []).map((id) =>
              edge(from, `module:${id}`, "conflicts", "Conflicts with"),
            ),
          ];
        })(),
  );
  return { nodes, edges };
};

// Seeded positions and bounded cooling make the same catalog reproducible.
export const layoutGraph = ({ nodes, edges }: ExplorerGraph) => {
  const clusters = [...new Set(nodes.map((n) => n.cluster))].sort();
  const positions = nodes.map((node, i) => {
    const angle =
      (clusters.indexOf(node.cluster) * Math.PI * 2) / clusters.length;
    return {
      ...node,
      x: 500 + Math.cos(angle) * 290 + Math.cos(i * 2.4) * 65,
      y: 360 + Math.sin(angle) * 230 + Math.sin(i * 2.4) * 65,
    };
  });
  const index = new Map(positions.map((n) => [n.id, n]));
  Array.from({ length: 180 }).forEach((_, step) => {
    const cooling = 1 - step / 180;
    positions.forEach((a) => {
      positions.forEach((b) => {
        if (a === b) return;
        const dx = a.x - b.x,
          dy = a.y - b.y;
        const distance = Math.max(25, dx * dx + dy * dy);
        a.x += (dx / distance) * 110 * cooling;
        a.y += (dy / distance) * 110 * cooling;
      });
      const angle =
        (clusters.indexOf(a.cluster) * Math.PI * 2) / clusters.length;
      a.x += (500 + Math.cos(angle) * 290 - a.x) * 0.025 * cooling;
      a.y += (360 + Math.sin(angle) * 230 - a.y) * 0.025 * cooling;
    });
    edges.forEach((e) => {
      const a = index.get(e.source),
        b = index.get(e.target);
      if (!a || !b) return;
      const force = e.kind === "supports" ? 0.018 : 0.002;
      const dx = (b.x - a.x) * force * cooling,
        dy = (b.y - a.y) * force * cooling;
      a.x += dx;
      a.y += dy;
      b.x -= dx;
      b.y -= dy;
    });
  });
  const minX = Math.min(...positions.map((n) => n.x));
  const maxX = Math.max(...positions.map((n) => n.x));
  const minY = Math.min(...positions.map((n) => n.y));
  const maxY = Math.max(...positions.map((n) => n.y));
  const scale = Math.min(
    840 / Math.max(1, maxX - minX),
    560 / Math.max(1, maxY - minY),
  );
  return positions.map((n) => ({
    ...n,
    x: 500 + (n.x - (minX + maxX) / 2) * scale,
    y: 360 + (n.y - (minY + maxY) / 2) * scale,
  }));
};
