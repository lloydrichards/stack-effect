import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { CatalogSources } from "@repo/domain/CatalogSource";
import { CatalogCache, CatalogLoader } from "@repo/scaffold/browser";
import { Effect, Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { useEffect, useMemo, useState } from "react";
import {
  buildExplorerGraph,
  layoutGraph,
  relationshipKinds,
  type ExplorerGraph,
  type RelationshipKind,
} from "~/components/catalog-graph/model";
import { registryUrl } from "~/workers/recipe-builder/registry-url";

const loaderLayer = CatalogLoader.layer.pipe(
  Layer.provide(CatalogCache.memory),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(BrowserCrypto.layer),
);
const colors: Record<RelationshipKind, string> = {
  supports: "#94a3b8",
  requires: "#3b82f6",
  implies: "#a855f7",
  child: "#14b8a6",
  conflicts: "#ef4444",
  provider: "#f59e0b",
};
const clusterColors = [
  "#3b82f6",
  "#14b8a6",
  "#a855f7",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
];

export default function CatalogGraphPage() {
  const [remote, setRemote] = useState("");
  const [includeOfficial, setIncludeOfficial] = useState(true);
  const [request, setRequest] = useState({
    remote: "",
    includeOfficial: true,
    revision: 0,
  });
  const [graph, setGraph] = useState<ExplorerGraph>();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Loading catalog…");
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [cluster, setCluster] = useState("");
  const [enabled, setEnabled] =
    useState<ReadonlyArray<RelationshipKind>>(relationshipKinds);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  useEffect(() => {
    setGraph(undefined);
    setError("");
    setSelected("");
    setCluster("");
    setStatus("Loading catalog…");
    const program = Effect.gen(function* () {
      const sources = yield* Schema.decodeUnknownEffect(CatalogSources)([
        ...(request.includeOfficial ? [{ name: "official" }] : []),
        ...(request.remote.trim()
          ? [{ name: "remote", url: request.remote.trim() }]
          : []),
      ]);
      const loader = yield* CatalogLoader;
      const loaded = yield* loader.loadSources({
        sources,
        officialUrl: registryUrl(
          window.location.origin,
          import.meta.env.BASE_URL,
        ),
      });
      return {
        graph: buildExplorerGraph(loaded.catalog),
        sources: loaded.sources,
      };
    }).pipe(Effect.provide(loaderLayer));
    const controller = new AbortController();
    void Effect.runPromiseExit(
      program.pipe(
        Effect.match({
          onFailure: (failure) => {
            if (!controller.signal.aborted) {
              setError(String(failure));
              setStatus("");
            }
          },
          onSuccess: (result) => {
            if (!controller.signal.aborted) {
              setGraph(result.graph);
              setStatus(
                result.sources
                  .map((s) => `${s.name}: ${s.sourceUrl}`)
                  .join(" · "),
              );
            }
          },
        }),
      ),
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, [request]);
  const positions = useMemo(() => (graph ? layoutGraph(graph) : []), [graph]);
  const clusters = [...new Set(positions.map((n) => n.cluster))].sort();
  const color = (kind: string) =>
    clusterColors[clusters.indexOf(kind) % clusterColors.length];
  const visible = positions.filter(
    (n) =>
      (!cluster || n.cluster === cluster) &&
      (!search ||
        `${n.id} ${n.title} ${n.description}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const ids = new Set(visible.map((n) => n.id));
  const edges =
    graph?.edges.filter(
      (e) => enabled.includes(e.kind) && ids.has(e.source) && ids.has(e.target),
    ) ?? [];
  const neighbors = new Set(
    edges
      .filter((e) => e.source === selected || e.target === selected)
      .flatMap((e) => [e.source, e.target]),
  );
  const node = positions.find((n) => n.id === selected);
  const index = new Map(positions.map((n) => [n.id, n]));
  const control = "rounded border bg-background px-3 py-2 text-sm";
  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold">Catalog explorer</h1>
        <p className="mt-2 text-muted-foreground">
          Explore target kinds, modules, and the relationships that shape a
          Blueprint.
        </p>
      </header>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setRequest({
            remote,
            includeOfficial,
            revision: request.revision + 1,
          });
        }}
      >
        <label className="flex-1 text-sm">
          Remote catalog JSON URL
          <input
            className={`${control} mt-1 block w-full`}
            type="url"
            placeholder="https://example.com/registry/v1/catalog.json"
            value={remote}
            onChange={(e) => setRemote(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 py-2 text-sm">
          <input
            type="checkbox"
            checked={includeOfficial}
            onChange={(e) => setIncludeOfficial(e.target.checked)}
          />
          Include official catalog
        </label>
        <button className={control} type="submit">
          Load catalogs
        </button>
      </form>
      <p className="break-all text-xs text-muted-foreground" role="status">
        {status}
      </p>
      {error && (
        <p role="alert" className="rounded border border-red-500 p-3 text-sm">
          {error} Remote hosts must allow browser requests from this site.
          Select official when a remote catalog declares it as a requirement.
        </p>
      )}
      {graph && (
        <>
          <div className="flex flex-wrap gap-2">
            <label>
              {" "}
              <span className="sr-only">Search nodes</span>
              <input
                className={control}
                placeholder="Search nodes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">Target cluster</span>
              <select
                className={control}
                value={cluster}
                onChange={(e) => setCluster(e.target.value)}
              >
                <option value="">All target clusters</option>
                {clusters.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <button
              className={control}
              onClick={() => setZoom((z) => Math.min(3, z * 1.25))}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              className={control}
              onClick={() => setZoom((z) => Math.max(0.4, z / 1.25))}
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              className={control}
              onClick={() => {
                setPan({ x: 0, y: 0 });
                setZoom(1);
                setSelected("");
              }}
            >
              Reset view
            </button>
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            {relationshipKinds.map((kind) => (
              <label key={kind} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={enabled.includes(kind)}
                  onChange={(e) =>
                    setEnabled((current) =>
                      e.target.checked
                        ? [...current, kind]
                        : current.filter((k) => k !== kind),
                    )
                  }
                />
                <span style={{ color: colors[kind] }}>●</span>
                {kind === "provider" ? "candidate provider" : kind}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {visible.length} of {positions.length} nodes · {edges.length}{" "}
            relationships. Squares are target kinds; circles are modules. Drag
            the background to pan. Select a node to inspect incoming and
            outgoing links.
          </p>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <svg
              viewBox={`${-80 - pan.x} ${-80 - pan.y} ${1160 / zoom} ${880 / zoom}`}
              className="w-full touch-none rounded-lg border bg-muted/20"
              style={{ minHeight: 450 }}
              aria-label="Catalog relationship graph"
              onPointerDown={(e) => {
                if (e.target === e.currentTarget)
                  e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  const scale =
                    1160 / zoom / e.currentTarget.getBoundingClientRect().width;
                  setPan((p) => ({
                    x: p.x + e.movementX * scale,
                    y: p.y + e.movementY * scale,
                  }));
                }
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
              }}
            >
              <defs>
                {relationshipKinds.map((kind) => (
                  <marker
                    key={kind}
                    id={`arrow-${kind}`}
                    viewBox="0 0 10 10"
                    refX="20"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={colors[kind]} />
                  </marker>
                ))}
              </defs>
              {edges.map((e, i) => {
                const a = index.get(e.source)!,
                  b = index.get(e.target)!;
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={colors[e.kind]}
                    strokeWidth={
                      selected &&
                      (e.source === selected || e.target === selected)
                        ? 2.5
                        : 1
                    }
                    opacity={
                      selected && e.source !== selected && e.target !== selected
                        ? 0.08
                        : 0.5
                    }
                    strokeDasharray={
                      e.kind === "implies" || e.kind === "provider"
                        ? "5 4"
                        : undefined
                    }
                    markerEnd={`url(#arrow-${e.kind})`}
                  >
                    <title>{`${a.title} → ${b.title}: ${e.label}`}</title>
                  </line>
                );
              })}
              {visible.map((n) => (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${n.kind}: ${n.title}`}
                  aria-pressed={n.id === selected}
                  className="cursor-pointer outline-none focus:stroke-foreground"
                  opacity={
                    selected && selected !== n.id && !neighbors.has(n.id)
                      ? 0.2
                      : 1
                  }
                  onClick={() => setSelected(n.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(n.id);
                    }
                  }}
                >
                  <title>{n.description}</title>
                  {n.kind === "target" ? (
                    <rect
                      x={-10}
                      y={-10}
                      width={20}
                      height={20}
                      rx={3}
                      fill={color(n.cluster)}
                    />
                  ) : (
                    <circle
                      r={n.id === selected ? 9 : 6}
                      fill={color(n.cluster)}
                    />
                  )}
                  <text
                    y={-15}
                    textAnchor="middle"
                    className="fill-foreground text-[10px]"
                    style={{
                      paintOrder: "stroke",
                      stroke: "var(--background)",
                      strokeWidth: 3,
                    }}
                  >
                    {n.kind === "target" || selected === n.id || search
                      ? n.title
                      : ""}
                  </text>
                </g>
              ))}
            </svg>
            <aside
              className="max-h-[650px] overflow-auto rounded-lg border p-4 text-sm"
              aria-label="Node inspector"
            >
              {node ? (
                <>
                  <h2 className="font-semibold">{node.title}</h2>
                  <p className="mt-1 break-all font-mono text-xs">{node.id}</p>
                  <p className="my-3">{node.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Source: {node.source} · Cluster: {node.cluster}
                  </p>
                  <h3 className="mt-4 font-semibold">Relationships</h3>
                  <ul className="mt-2 space-y-2">
                    {graph.edges
                      .filter(
                        (e) => e.source === node.id || e.target === node.id,
                      )
                      .map((e, i) => {
                        const outgoing = e.source === node.id;
                        const other = index.get(outgoing ? e.target : e.source);
                        return (
                          <li key={i}>
                            <button
                              className="text-left underline underline-offset-2"
                              onClick={() => {
                                setSelected(other?.id ?? "");
                                setSearch("");
                                setCluster("");
                              }}
                            >
                              {outgoing ? "→" : "←"}{" "}
                              {other?.title ?? "Missing node"}
                            </button>
                            <p className="text-xs text-muted-foreground">
                              {e.label}
                            </p>
                          </li>
                        );
                      })}
                  </ul>
                  <details className="mt-4">
                    <summary>Definition details</summary>
                    <pre className="mt-2 overflow-auto text-xs">
                      {node.details}
                    </pre>
                  </details>
                </>
              ) : (
                <>
                  <h2 className="font-semibold">Explore the catalog</h2>
                  <p className="mt-2 text-muted-foreground">
                    Choose a node in the graph or the list below. Clusters use
                    the first supported target kind; the supports links show
                    every supported kind. Internal modules are included.
                  </p>
                </>
              )}
            </aside>
          </div>
          <details>
            <summary className="cursor-pointer text-sm">
              Browse visible nodes ({visible.length})
            </summary>
            <div className="mt-3 grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">
              {visible.map((n) => (
                <button
                  className={`${control} text-left`}
                  key={n.id}
                  onClick={() => setSelected(n.id)}
                >
                  {n.title}{" "}
                  <span className="text-xs text-muted-foreground">{n.id}</span>
                </button>
              ))}
            </div>
          </details>
          <p className="text-xs text-muted-foreground">
            Arrows run from a definition to what it supports, requires, implies,
            or contains. Provider links show eligible choices, not resolved
            dependencies. Target nodes represent kinds; the inspector preserves
            exact target names. This graph describes catalog definitions; it
            does not resolve a Selection or preview a Plan.
          </p>
        </>
      )}
    </section>
  );
}
