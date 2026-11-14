import { Maximize2, Minus, Plus, RotateCcw, Pause, Play } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CanvasLayout, CanvasNode } from "./layout";
import { moduleAccessReason, targetEntryModules } from "./module-hierarchy";
import { ModuleNode, displayNode } from "./module-node";
import { moduleRelationships } from "./module-relationships";
import { type CatalogModel, type SelectionProjection } from "./selection";
import type { Direction } from "./selection-url";
import { useOrganicSimulation } from "./use-organic-simulation";
import { detailLevel } from "./variants";

export type BlockedModule = { left: string; right: string; message: string };
type Props = {
  layout: CanvasLayout;
  direction: Direction;
  model: CatalogModel;
  projection: SelectionProjection;
  focused: string;
  onFocus: (id: string) => void;
  onAction: (node: CanvasNode) => void;
  onTargetKind: (kind: string) => void;
  blocked: ReadonlyMap<string, ReadonlyArray<BlockedModule>>;
  search: string;
  sourceFilter: string;
};
const palette = [
  "#378e84",
  "#b17c35",
  "#747ec1",
  "#c17480",
  "#5e94b4",
  "#a283b0",
  "#88984e",
  "#b67c5f",
];
export function GraphCanvas({
  layout,
  direction,
  model,
  projection,
  focused,
  onFocus,
  onAction,
  onTargetKind,
  blocked,
  search,
  sourceFilter,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 720 });
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [hovered, setHovered] = useState("");
  const drag = useRef<
    | {
        id: string | undefined;
        startX: number;
        startY: number;
        x: number;
        y: number;
        moved: boolean;
      }
    | undefined
  >(undefined);
  const wasDragged = useRef(false);
  const previousWidth = useRef(layout.width);
  useLayoutEffect(() => {
    const prior = previousWidth.current;
    previousWidth.current = layout.width;
    if (prior !== layout.width)
      setCamera((current) => ({
        ...current,
        zoom: (current.zoom * layout.width) / prior,
      }));
  }, [layout.width]);
  const viewWidth = layout.width / camera.zoom;
  const viewHeight = (viewWidth * size.height) / size.width;
  const scale = Math.max(0.02, size.width / viewWidth);
  const level = detailLevel(scale, direction);
  const physics = useOrganicSimulation(
    layout,
    model,
    projection,
    true,
    focused,
  );
  const focusedTarget = projection.targets.find(
    (owner) => `target:${owner.toKey()}` === focused,
  );
  const isEmphasized = (node: CanvasNode) =>
    node.id === focused ||
    node.id === hovered ||
    (direction === "bands" &&
      (node.discovery === "next" ||
        (projection.targets.length > 0 && node.status !== "catalog"))) ||
    Boolean(
      direction === "bands" &&
      node.status === "catalog" &&
      focusedTarget &&
      targetEntryModules(model, focusedTarget).some(
        (module) => module.id === node.moduleId,
      ),
    );
  const nodes = physics.nodes.map((node) =>
    displayNode(node, scale, level, isEmphasized(node)),
  );
  const hubNodes: CanvasNode[] = physics.hubs.map((hub) => ({
    id: hub.id,
    title: hub.kind,
    subtitle: hub.source,
    source: hub.source,
    kind: hub.kind,
    status: "target",
    x: hub.x,
    y: hub.y,
    width: 0,
    height: 0,
    minY: layout.catalogY,
    maxY: Number.POSITIVE_INFINITY,
  }));
  const index = new Map([...nodes, ...hubNodes].map((n) => [n.id, n]));
  const active = hovered || focused;
  const activeNode = index.get(active);
  const blockers =
    activeNode?.status === "catalog"
      ? (blocked.get(activeNode.moduleId ?? "") ?? [])
      : [];
  const moduleNodeId = (id: string) =>
    nodes.find((n) => n.moduleId === id && n.status !== "catalog")?.id ??
    `catalog:${id}`;
  const referenceLinks = activeNode?.moduleId
    ? model.modules
        .flatMap((m) => [
          ...m.dependencies.flatMap((d) =>
            d._tag === "required-module"
              ? [
                  {
                    from: moduleNodeId(m.id),
                    to: moduleNodeId(d.moduleId),
                    reason: "Requires module",
                  },
                ]
              : [],
          ),
          ...(m.implies ?? []).map((i) => ({
            from: moduleNodeId(m.id),
            to: moduleNodeId(i.moduleId),
            reason: "Implies module",
          })),
          ...(m.conflictsWith ?? []).map((id) => ({
            from: moduleNodeId(m.id),
            to: moduleNodeId(id),
            reason: "Conflicts with",
          })),
          ...(m.children ?? []).map((c) => ({
            from: moduleNodeId(m.id),
            to: moduleNodeId(c.moduleId),
            reason: `${c.requirement} child`,
          })),
        ])
        .filter((l) => l.from === active || l.to === active)
    : [];
  const supportLinks = physics.bonds
    .filter(
      (b) =>
        (b.type === "support" || b.type === "bridge") &&
        (b.from === active ||
          b.to === active ||
          Boolean(
            active === focused &&
            focusedTarget &&
            projection.modules.some(
              (entry) =>
                entry.id === b.from &&
                entry.owner.toKey() === focusedTarget.toKey(),
            ),
          )),
    )
    .map((b) => ({
      from: b.from,
      to: b.to,
      reason:
        b.from.startsWith("target:") || b.from.startsWith("catalog:")
          ? "Compatible with selected target"
          : "Available optional feature",
    }));
  const links = [
    ...projection.links,
    ...referenceLinks,
    ...supportLinks,
  ].filter((l) => index.has(l.from) && index.has(l.to));
  const activeTarget = projection.targets.find(
    (owner) => `target:${owner.toKey()}` === active,
  );
  const targetMembers = new Set(
    projection.modules
      .filter((module) => module.owner.toKey() === activeTarget?.toKey())
      .map((module) => module.id),
  );
  const neighbors = new Set([
    active,
    ...targetMembers,
    ...physics.nodes
      .filter(
        (node) =>
          activeTarget &&
          node.discovery === "next" &&
          model.modules.some(
            (module) =>
              module.id === node.moduleId &&
              module.supportedOn.some((rule) => activeTarget.matches(rule)),
          ),
      )
      .map((node) => node.id),
    ...links
      .filter((l) => l.from === active || l.to === active)
      .flatMap((l) => [l.from, l.to]),
    ...blockers.flatMap((b) => [b.left, b.right]),
  ]);
  const color = (kind: string) =>
    palette[
      Math.max(
        0,
        model.targets.findIndex((t) => t.kind === kind),
      ) % palette.length
    ];
  const matches = (node: CanvasNode) =>
    (!search ||
      `${node.title} ${node.moduleId ?? ""} ${node.kind}`
        .toLowerCase()
        .includes(search.toLowerCase())) &&
    (!sourceFilter || node.source === sourceFilter);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(svg);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const ratioX = (event.clientX - rect.left) / rect.width,
        ratioY = (event.clientY - rect.top) / rect.height;
      setCamera((current) => {
        const zoom = Math.max(
          (layout.width / rect.width) * 0.06,
          Math.min(
            (layout.width / rect.width) * 3,
            current.zoom * Math.exp(-event.deltaY * 0.002),
          ),
        );
        const oldWidth = layout.width / current.zoom,
          newWidth = layout.width / zoom;
        return {
          zoom,
          x: current.x + ratioX * (oldWidth - newWidth),
          y:
            current.y +
            (ratioY * (oldWidth - newWidth) * rect.height) / rect.width,
        };
      });
    };
    svg.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      svg.removeEventListener("wheel", wheel);
    };
  }, [layout.width]);
  const frameNodes = (points: ReadonlyArray<CanvasNode>, maxScale = 1.2) => {
    if (!points.length) return;
    const minX = Math.min(...points.map((n) => n.x)) - 140,
      maxX = Math.max(...points.map((n) => n.x + n.width)) + 140;
    const minY = Math.min(...points.map((n) => n.y)) - 170,
      maxY = Math.max(...points.map((n) => n.y + n.height)) + 100;
    const desktop = size.width > 1100;
    const left = desktop ? 320 : 20;
    const right =
      desktop && svgRef.current?.closest(".inspector-open") ? 340 : 20;
    const top = desktop ? 150 : 310;
    const bottom = 160;
    const availableWidth = Math.max(200, size.width - left - right);
    const availableHeight = Math.max(200, size.height - top - bottom);
    const nextScale = Math.min(
      maxScale,
      availableWidth / (maxX - minX),
      availableHeight / (maxY - minY),
    );
    setCamera({
      x: (minX + maxX) / 2 - (left + availableWidth / 2) / nextScale,
      y: (minY + maxY) / 2 - (top + availableHeight / 2) / nextScale,
      zoom: (layout.width * nextScale) / size.width,
    });
  };
  const fitGraph = () => frameNodes([...physics.nodes, ...hubNodes]);
  const fitSelection = () => {
    const hasNext = physics.nodes.some((node) => node.discovery === "next");
    frameNodes(
      physics.nodes.filter(
        (node) =>
          node.status !== "catalog" ||
          (direction === "bands" &&
            node.discovery === (hasNext ? "next" : "available")),
      ),
    );
  };
  const fitCluster = (kind: string) => {
    frameNodes(
      [
        ...physics.nodes.filter(
          (n) => n.status === "catalog" && n.kind === kind,
        ),
        ...hubNodes.filter((n) => n.kind === kind),
      ],
      0.95,
    );
  };
  const initialized = useRef("");
  useEffect(() => {
    if (physics.ready && initialized.current !== direction) {
      initialized.current = direction;
      if (direction === "bands" && projection.targets.length) fitSelection();
      else fitGraph();
    }
  }, [direction, physics.ready, size.width]);
  const previousPickCount = useRef(
    layout.nodes.filter((node) => node.status === "explicit").length,
  );
  useEffect(() => {
    if (!physics.ready) return;
    const count = layout.nodes.filter(
      (node) => node.status === "explicit",
    ).length;
    if (count > 0 && previousPickCount.current === 0 && direction !== "bands")
      fitSelection();
    previousPickCount.current = count;
  }, [physics.ready, layout]);
  const navigatedFocus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!physics.ready || navigatedFocus.current === focused) return;
    navigatedFocus.current = focused;
    const node = index.get(focused);
    if (!node) return;
    if (direction === "bands" && node.status === "target") {
      const owner = projection.targets.find(
        (target) => `target:${target.toKey()}` === node.id,
      );
      const compatible = physics.nodes.filter(
        (candidate) =>
          candidate.status === "catalog" &&
          owner &&
          targetEntryModules(model, owner).some(
            (module) => module.id === candidate.moduleId,
          ),
      );
      frameNodes([node, ...compatible], 0.8);
      return;
    }
    if (level === "map" && node.moduleId) {
      frameNodes([node], 0.9);
      return;
    }
    setCamera((current) => {
      const width = layout.width / current.zoom,
        height = (width * size.height) / size.width;
      return node.x < current.x ||
        node.y < current.y ||
        node.x + node.width > current.x + width ||
        node.y + node.height > current.y + height
        ? {
            ...current,
            x: node.x + node.width / 2 - width / 2,
            y: node.y - 140 / scale,
          }
        : current;
    });
    // Explicit focus navigates. Physics ticks never move the camera.
  }, [focused, physics.ready]);
  const jumpToFocus = () => {
    const node = index.get(focused) ?? nodes.find(matches);
    if (node) frameNodes([node], 1.2);
  };
  const finishDrag = () => {
    if (drag.current?.id) physics.dragEnd(drag.current.id);
    drag.current = undefined;
  };
  const phaseLabel =
    level === "map"
      ? direction === "bands"
        ? "Module islands · zoom in or add a target to explore compatibility"
        : "Target overview · choose a target to read its modules"
      : level === "names"
        ? "Module names · zoom in for relationships"
        : level === "context"
          ? "Relationships · zoom in for descriptions"
          : "Module details · descriptions, capabilities and requirements";
  return (
    <div
      className={`prototype-canvas organic variant-${direction}`}
      data-detail-level={level}
    >
      <div className="target-jumpbar" aria-label="Target navigation">
        <span>{direction === "bands" ? "Your targets" : "Targets"}</span>
        {direction === "bands" && (
          <>
            {projection.targets.map((owner) => (
              <button
                key={owner.toKey()}
                aria-pressed={focused === `target:${owner.toKey()}`}
                onClick={() => onFocus(`target:${owner.toKey()}`)}
              >
                {owner.kind}/{owner.name}
              </button>
            ))}
            <button onClick={() => onTargetKind("")}>+ Add target</button>
          </>
        )}
        {physics.hubs.map((hub) => (
          <button
            key={hub.id}
            onClick={() => fitCluster(hub.kind)}
            aria-label={`Zoom to ${hub.kind}`}
          >
            {hub.kind}
          </button>
        ))}
      </div>
      <div className="canvas-tools">
        <span>{phaseLabel}</span>
        <button
          onClick={() =>
            setCamera((c) => ({
              ...c,
              zoom: Math.min((layout.width / size.width) * 3, c.zoom * 1.35),
            }))
          }
          aria-label="Zoom in"
        >
          <Plus size={15} />
        </button>
        <button
          onClick={() =>
            setCamera((c) => ({
              ...c,
              zoom: Math.max((layout.width / size.width) * 0.06, c.zoom / 1.35),
            }))
          }
          aria-label="Zoom out"
        >
          <Minus size={15} />
        </button>
        <button
          onClick={physics.togglePause}
          aria-label={physics.paused ? "Resume physics" : "Pause physics"}
        >
          {physics.paused ? <Play size={15} /> : <Pause size={15} />}
          {physics.paused ? "Resume" : "Pause"}
        </button>
        <button onClick={jumpToFocus}>Find focus</button>
        {layout.nodes.some((node) => node.status !== "catalog") && (
          <button onClick={fitSelection}>Selection</button>
        )}
        <button
          onClick={() =>
            frameNodes([
              ...physics.nodes.filter((n) => n.status === "catalog"),
              ...hubNodes,
            ])
          }
        >
          Catalog
        </button>
        <button onClick={fitGraph} aria-label="Fit whole graph">
          <Maximize2 size={15} />
        </button>
        <button
          onClick={() => {
            physics.reset();
            initialized.current = "";
          }}
          aria-label="Reset positions"
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`${camera.x} ${camera.y} ${viewWidth} ${viewHeight}`}
        className="graph-surface"
        aria-label={`${direction} catalog selection canvas`}
        onPointerDown={(event) => {
          const target = event.target;
          if (
            !(target instanceof Element) ||
            target.closest("[data-node-action]")
          )
            return;
          const id =
            target.closest("[data-node-id]")?.getAttribute("data-node-id") ??
            undefined;
          const node = id ? index.get(id) : undefined;
          drag.current = {
            id,
            startX: event.clientX,
            startY: event.clientY,
            x: node ? node.x + node.width / 2 : camera.x,
            y: node ? node.y + node.height / 2 : camera.y,
            moved: false,
          };
          wasDragged.current = false;
          if (id) physics.dragStart(id);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start) return;
          const dx = (event.clientX - start.startX) / scale,
            dy = (event.clientY - start.startY) / scale;
          if (Math.abs(dx) + Math.abs(dy) > 4) {
            start.moved = true;
            wasDragged.current = true;
          }
          if (!start.moved) return;
          if (start.id) physics.dragTo(start.id, start.x + dx, start.y + dy);
          else
            setCamera((current) => ({
              ...current,
              x: start.x - dx,
              y: start.y - dy,
            }));
        }}
        onPointerUp={(event) => {
          finishDrag();
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={finishDrag}
      >
        <defs>
          <pattern
            id="prototype-dots"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="0.9" className="dot" />
          </pattern>
          <marker
            id="prototype-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="arrow" />
          </marker>
        </defs>
        <rect
          x={-100000}
          y={-100000}
          width={300000}
          height={300000}
          fill="url(#prototype-dots)"
        />
        {layout.catalogY > 100 && (
          <>
            <text
              x={1000}
              y={30}
              className="zone-label"
              style={{ fontSize: 13 / scale }}
            >
              YOUR SELECTION
            </text>
            <line
              x1={0}
              x2={layout.width}
              y1={layout.catalogY - 90}
              y2={layout.catalogY - 90}
              className="zone-divider"
            />
          </>
        )}
        <text
          x={200}
          y={layout.catalogY - 20}
          className="zone-label"
          style={{ fontSize: 13 / scale }}
        >
          {direction === "bands" && projection.targets.length
            ? "AVAILABLE NEXT · unlocked features, then modules for your targets"
            : "REMAINING CATALOG"}
        </text>
        {physics.bonds
          .filter((b) => b.type === "bridge" && direction !== "bands")
          .map((b) => {
            const from = index.get(b.from),
              to = index.get(b.to);
            return from && to ? (
              <path
                key={`${b.from}:${b.to}`}
                d={`M${from.x + from.width / 2},${from.y + from.height} C${from.x},${layout.catalogY - 80} ${to.x},${layout.catalogY + 80} ${to.x},${to.y}`}
                className="catalog-bridge"
              >
                <title>
                  Catalog family: {to.kind}. Visual link only; the simulations
                  are independent.
                </title>
              </path>
            ) : null;
          })}
        {direction === "bands" &&
          moduleRelationships(model).map((relationship, i) => {
            const from = index.get(`catalog:${relationship.from}`),
              to = index.get(`catalog:${relationship.to}`);
            return from && to ? (
              <line
                key={`relationship:${i}`}
                x1={from.x + from.width / 2}
                y1={from.y + from.height / 2}
                x2={to.x + to.width / 2}
                y2={to.y + to.height / 2}
                className="module-relationship"
                strokeDasharray={
                  relationship.reason.startsWith("Provider") ? "4 6" : undefined
                }
              >
                <title>
                  {relationship.reason}: {from.title} → {to.title}
                </title>
              </line>
            ) : null;
          })}
        {physics.bonds
          .filter((b) => b.type === "support")
          .map((b) => {
            const from = index.get(b.from),
              to = index.get(b.to);
            return from && to ? (
              <line
                key={`${b.from}:${b.to}`}
                x1={from.x + from.width / 2}
                y1={from.y + from.height / 2}
                x2={to.x}
                y2={to.y}
                className="support-spring"
                style={{
                  stroke: color(from.kind),
                  opacity:
                    active && (active === from.id || active === to.id)
                      ? 0.6
                      : active
                        ? 0.025
                        : level === "map"
                          ? 0.12
                          : 0.08,
                }}
              />
            ) : null;
          })}
        {links.map((link, i) => {
          const from = index.get(link.from)!,
            to = index.get(link.to)!;
          const highlighted =
            link.from === active ||
            link.to === active ||
            (targetMembers.has(link.from) && targetMembers.has(link.to));
          const compatibility =
            link.reason === "Compatible with selected target" ||
            link.reason === "Available optional feature";
          const x1 = from.x + from.width / 2,
            y1 = from.y + from.height,
            x2 = to.x + to.width / 2,
            y2 = to.y;
          return (
            <path
              key={`${link.from}-${link.to}-${i}`}
              d={`M${x1},${y1} C${x1},${y1 + 90} ${x2},${y2 - 90} ${x2},${y2}`}
              className={`graph-link ${highlighted ? "highlighted" : ""} ${link.reason.includes("Conflicts") ? "conflict" : ""} ${compatibility ? "compatibility" : ""}`}
              style={{ opacity: active && !highlighted ? 0.08 : undefined }}
              strokeDasharray={
                compatibility ||
                link.reason === "Optional feature" ||
                link.reason.includes("Impli") ||
                link.reason.includes("Decision")
                  ? "6 4"
                  : undefined
              }
              markerEnd={compatibility ? undefined : "url(#prototype-arrow)"}
            >
              <title>{link.reason}</title>
            </path>
          );
        })}
        {nodes.map((node) => (
          <ModuleNode
            key={node.visualId ?? node.id}
            node={node}
            model={model}
            scale={scale}
            level={level}
            color={color(node.kind)}
            focused={node.id === focused}
            emphasized={isEmphasized(node)}
            dimmed={
              (!matches(node) && node.status === "catalog") ||
              Boolean(active && !neighbors.has(node.id))
            }
            blocked={(() => {
              const module = model.modules.find(
                (entry) => entry.id === node.moduleId,
              );
              const reason =
                module && node.status === "catalog"
                  ? moduleAccessReason(model, projection, module, focusedTarget)
                  : undefined;
              return [
                ...(node.status === "catalog"
                  ? (blocked.get(node.moduleId ?? "") ?? [])
                  : []),
                ...(reason
                  ? [{ left: node.id, right: node.id, message: reason }]
                  : []),
              ];
            })()}
            onFocus={() => onFocus(node.id)}
            onAction={() => onAction(node)}
            onHover={(value) => setHovered(value ? node.id : "")}
            dragged={() => wasDragged.current}
          />
        ))}
        {physics.hubs.map((hub) => (
          <g
            key={hub.id}
            className="organic-hub"
            data-node-id={hub.id}
            data-hub-id={hub.kind}
            onMouseEnter={() => setHovered(hub.id)}
            onMouseLeave={() => setHovered("")}
          >
            <circle
              cx={hub.x}
              cy={hub.y}
              r={8 / scale}
              fill={color(hub.kind)}
            />
            <circle
              cx={hub.x}
              cy={hub.y}
              r={14 / scale}
              fill="none"
              stroke={color(hub.kind)}
              opacity={0.25}
            />
            <foreignObject
              x={hub.x - 95 / scale}
              y={hub.y - 70 / scale}
              width={190 / scale}
              height={48 / scale}
            >
              <div
                className="hub-label semantic-hub"
                style={{ borderColor: color(hub.kind), fontSize: 12 / scale }}
              >
                <button
                  className="hub-name"
                  aria-label={`Inspect target kind ${hub.kind}`}
                  onFocus={() => onFocus(hub.id)}
                  onClick={() => {
                    if (!wasDragged.current) onFocus(hub.id);
                  }}
                  style={{ padding: `${4 / scale}px` }}
                >
                  <strong style={{ fontSize: 14 / scale }}>{hub.kind}</strong>
                  <small style={{ fontSize: 10 / scale }}>
                    {hub.source} · {hub.count} modules
                  </small>
                </button>
                <button
                  data-node-action
                  aria-label={`Zoom into ${hub.kind} cluster`}
                  onClick={() => fitCluster(hub.kind)}
                  style={{ width: 25 / scale, fontSize: 16 / scale }}
                >
                  ↗
                </button>
                <button
                  data-node-action
                  aria-label={`New ${hub.kind} target`}
                  onClick={() => onTargetKind(hub.kind)}
                  style={{ width: 25 / scale, fontSize: 18 / scale }}
                >
                  +
                </button>
              </div>
            </foreignObject>
          </g>
        ))}
      </svg>
      <div className="canvas-legend">
        <span>
          <i className="legend-explicit" />
          Chosen
        </span>
        <span>
          <i className="legend-auto" />
          Automatic
        </span>
        <span>
          <i className="legend-pending" />
          Pending choice
        </span>
        <span>{Math.round(scale * 100)}%</span>
      </div>
    </div>
  );
}
