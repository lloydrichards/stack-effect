import { CatalogService } from "@repo/catalog";
import type {
  CatalogEdge,
  CatalogGraph,
  CatalogNode,
} from "@repo/domain/Catalog";
import { Table } from "@repo/tui";
import {
  Array as Arr,
  Console,
  Effect,
  Graph,
  Match,
  Option,
  Order,
  Result,
} from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { Ansi, Box } from "effect-boxes";

const formatFlag = Flag.choice("format", ["table", "mermaid", "dot"]).pipe(
  Flag.optional,
  Flag.withDescription("Output format: table (default), mermaid, or dot"),
);

// ── Helpers ──────────────────────────────────────────────────────────

type IndexedNode = readonly [idx: number, node: typeof CatalogNode.Type];

const nodeLabel = Match.type<typeof CatalogNode.Type>().pipe(
  Match.tag("target", (n) => n.definition.kind),
  Match.tag("module", (n) => n.definition.id),
  Match.exhaustive,
);

const collectNodes = (g: CatalogGraph): Array<IndexedNode> =>
  Array.from(Graph.entries(Graph.nodes(g)));

const collectEdges = (g: CatalogGraph) =>
  Array.from(Graph.entries(Graph.edges(g)));

const splitByTag = (nodes: ReadonlyArray<IndexedNode>) => ({
  targets: Arr.filter(nodes, ([, n]) => n._tag === "target"),
  modules: Arr.filter(nodes, ([, n]) => n._tag === "module"),
});

const labelsOf = (nodes: ReadonlyArray<IndexedNode>): string =>
  Arr.map(nodes, ([, n]) => nodeLabel(n)).join(", ");

// ── Edge classification ─────────────────────────────────────────────

interface RowData {
  readonly node: typeof CatalogNode.Type;
  readonly supportedOn: ReadonlyArray<string>;
  readonly requires: ReadonlyArray<string>;
  readonly implies: ReadonlyArray<string>;
}

const classifyEdge = Match.type<typeof CatalogEdge.Type>().pipe(
  Match.when("supportedOn", () => "supportedOn" as const),
  Match.when("requiredModule", () => "requires" as const),
  Match.when("implies", () => "implies" as const),
  Match.exhaustive,
);

const collectRowData = (g: CatalogGraph): Array<RowData> => {
  const edges = collectEdges(g);

  return Arr.map(collectNodes(g), ([idx, node]) => {
    const outgoing = Arr.filter(edges, ([, e]) => e.source === idx);

    const buckets = Arr.groupBy(outgoing, ([, e]) => classifyEdge(e.data));

    const resolve = (key: string) =>
      Arr.map(buckets[key] ?? [], ([, e]) =>
        Graph.getNode(g, e.target).pipe(
          Option.map(nodeLabel),
          Option.getOrElse(() => "?"),
        ),
      );

    return {
      node,
      supportedOn: resolve("supportedOn"),
      requires: resolve("requires"),
      implies: resolve("implies"),
    };
  });
};

// ── Compute dependency layers ───────────────────────────────────────

const computeLayers = (g: CatalogGraph): Array<Array<IndexedNode>> => {
  const allNodes = collectNodes(g);
  const allEdges = collectEdges(g);

  const outgoing = Arr.groupBy(allEdges, ([, e]) => String(e.source));

  const topoOrder = Array.from(Graph.indices(Graph.topo(g)));

  // Longest path depth per node (reversed topo = dependencies first)
  const depth = new Map<number, number>();
  for (const idx of topoOrder.reverse()) {
    const deps = (outgoing[String(idx)] ?? []).map(([, e]) => e.target);
    depth.set(
      idx,
      deps.length > 0
        ? Math.max(...deps.map((d) => (depth.get(d) ?? 0) + 1))
        : 0,
    );
  }

  const maxLayer = Math.max(...depth.values(), 0);

  return Arr.filterMap(Arr.range(0, maxLayer), (layerIdx) => {
    const invertedDepth = maxLayer - layerIdx;
    const layer = Arr.filter(
      allNodes,
      ([idx]) => depth.get(idx) === invertedDepth,
    );
    return layer.length > 0 ? Result.succeed(layer) : Result.fail(undefined);
  });
};

// ── Compute connected clusters ──────────────────────────────────────

const computeClusters = (g: CatalogGraph): Array<Array<IndexedNode>> => {
  const allNodes = collectNodes(g);
  const allEdges = collectEdges(g);

  // Build undirected adjacency via groupBy on both directions
  const adj = new Map<number, Set<number>>();
  for (const [idx] of allNodes) adj.set(idx, new Set());
  for (const [, edge] of allEdges) {
    adj.get(edge.source)!.add(edge.target);
    adj.get(edge.target)!.add(edge.source);
  }

  const visited = new Set<number>();
  return Arr.filterMap(allNodes, ([startIdx]) => {
    if (visited.has(startIdx)) return Result.fail(undefined);

    const cluster: Array<IndexedNode> = [];
    const queue = [startIdx];
    visited.add(startIdx);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const entry = allNodes.find(([i]) => i === current)!;
      cluster.push(entry);
      for (const neighbor of adj.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    return Result.succeed(cluster);
  });
};

// ── Render sections ─────────────────────────────────────────────────

const renderLayers = (g: CatalogGraph): Box.Box<Ansi.AnsiStyle> => {
  const layerRows = Arr.map(computeLayers(g), (layer, i) => {
    const { targets, modules } = splitByTag(layer);
    const parts = [labelsOf(targets), labelsOf(modules)].filter(Boolean);

    return Box.hcat(
      [
        Box.text(`Layer ${i}`).pipe(
          Box.alignHoriz(Box.left, 10),
          Box.annotate(Ansi.bold),
        ),
        Box.para(parts.join(", "), Box.left, 90),
      ],
      Box.top,
    );
  });

  return Box.vcat(
    [
      Box.text("Dependency Layers").pipe(Box.annotate(Ansi.bold)),
      Box.text("(layer 0 = foundations, higher = dependents)").pipe(
        Box.annotate(Ansi.dim),
      ),
      Box.emptyBox(0, 1),
      ...layerRows,
    ],
    Box.left,
  );
};

const renderClusters = (g: CatalogGraph): Box.Box<Ansi.AnsiStyle> => {
  const clusterRows = Arr.map(computeClusters(g), (cluster, i) => {
    const { targets, modules } = splitByTag(cluster);
    const label =
      labelsOf(targets) || labelsOf(modules.slice(0, 1)) || "unknown";
    const content = labelsOf(modules) || "(none)";

    return Box.vcat(
      [
        Box.text(`Cluster ${i + 1}: ${label}`).pipe(Box.annotate(Ansi.bold)),
        Box.para(`  ${content}`, Box.left, 90).pipe(
          Box.moveRight(2),
          Box.annotate(Ansi.dim),
        ),
      ],
      Box.left,
    );
  });

  return Box.vcat(
    [
      Box.text("Connected Clusters").pipe(Box.annotate(Ansi.bold)),
      Box.text("(independent feature slices)").pipe(
        Box.moveRight(2),
        Box.annotate(Ansi.dim),
      ),
      Box.emptyBox(0, 1),
      ...clusterRows,
    ],
    Box.left,
  );
};

// ── Edge count summary ──────────────────────────────────────────────

const countEdges = (g: CatalogGraph) => {
  const edges = collectEdges(g);
  const counts = Arr.groupBy(edges, ([, e]) => e.data);
  return {
    supportedOn: (counts["supportedOn"] ?? []).length,
    requiredModule: (counts["requiredModule"] ?? []).length,
    implies: (counts["implies"] ?? []).length,
  };
};

// ── Main render ─────────────────────────────────────────────────────

const renderTable = (g: CatalogGraph) => {
  const nodeCount = Graph.nodeCount(g);
  const edgeCount = Graph.edgeCount(g);
  const acyclic = Graph.isAcyclic(g);
  const { targets, modules } = splitByTag(collectNodes(g));
  const edgeCounts = countEdges(g);

  const summary = Box.vcat(
    [
      Box.text("Graph Summary").pipe(Box.annotate(Ansi.bold)),
      Box.emptyBox(0, 1),
      Box.text(
        `Nodes: ${nodeCount} (${targets.length} targets, ${modules.length} modules)`,
      ),
      Box.text(
        `Edges: ${edgeCount} (${edgeCounts.supportedOn} supportedOn, ${edgeCounts.requiredModule} requiredModule, ${edgeCounts.implies} implies)`,
      ),
      Box.text(`Acyclic: ${acyclic ? "yes" : "no"}`),
    ],
    Box.left,
  );

  const structureSection = acyclic
    ? Box.vsep([renderLayers(g), renderClusters(g)], 1, Box.left)
    : Box.text("(graph has cycles, structural analysis unavailable)").pipe(
        Box.annotate(Ansi.yellow),
      );

  // Adjacency table
  const columns = [
    { header: "Node", width: 24 },
    { header: "Type", width: 8 },
    { header: "supportedOn →", width: 16 },
    { header: "requires →", width: 16 },
    { header: "implies →", width: 16 },
  ] as const;

  const sortedRows = Arr.sortBy(
    Order.mapInput(Order.String, (r: RowData) =>
      r.node._tag === "target" ? "0" : "1",
    ),
    Order.mapInput(
      Order.String,
      (r: RowData) => Arr.join(r.supportedOn, ", ") || "—",
    ),
    Order.mapInput(Order.String, (r: RowData) => nodeLabel(r.node)),
  )(collectRowData(g));

  const rows = sortedRows.map((r) => [
    Box.text(nodeLabel(r.node)).pipe(
      Box.annotate(r.node._tag === "target" ? Ansi.cyan : Ansi.white),
    ),
    Box.text(r.node._tag).pipe(
      Box.annotate(r.node._tag === "target" ? Ansi.cyan : Ansi.dim),
    ),
    Box.para(Arr.join(r.supportedOn, "\n") || "—", Box.left, 16).pipe(
      Box.annotate(Ansi.dim),
    ),
    Box.para(Arr.join(r.requires, "\n") || "—", Box.left, 16).pipe(
      Box.annotate(Ansi.dim),
    ),
    Box.para(Arr.join(r.implies, "\n") || "—", Box.left, 16).pipe(
      Box.annotate(Ansi.dim),
    ),
  ]);

  const table = Table([...columns], rows);

  return Box.vsep(
    [summary, structureSection, Box.emptyBox(0, 1), table],
    1,
    Box.left,
  ).pipe(Box.pad(0, 1), Box.border("rounded"));
};

// ── Command ─────────────────────────────────────────────────────────

export const graph = Command.make("graph", { format: formatFlag }, (flags) =>
  Effect.gen(function* () {
    const catalog = yield* CatalogService;
    const g = catalog.toGraph;
    const fmt = Option.getOrElse(flags.format, () => "table" as const);

    switch (fmt) {
      case "mermaid": {
        yield* Console.log(
          Graph.toMermaid(g, {
            nodeLabel,
            edgeLabel: (e) => e,
            direction: "LR",
          }),
        );
        break;
      }
      case "dot": {
        yield* Console.log(
          Graph.toGraphViz(g, { nodeLabel, edgeLabel: (e) => e }),
        );
        break;
      }
      case "table": {
        yield* Console.log(Box.renderPrettySync(renderTable(g)));
        break;
      }
    }
  }),
);
