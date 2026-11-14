import type { CSSProperties } from "react";
import type { BlockedModule } from "./graph-canvas";
import type { CanvasNode } from "./layout";
import type { CatalogModel } from "./selection";
import type { DetailLevel } from "./variants";

export const displayNode = (
  node: CanvasNode,
  scale: number,
  level: DetailLevel,
  emphasized: boolean,
): CanvasNode => {
  const shown = level === "map" && emphasized ? "names" : level;
  const width =
    shown === "map"
      ? 14 / scale
      : shown === "detail"
        ? 310
        : Math.max(260, 120 / scale);
  const height =
    shown === "map"
      ? 14 / scale
      : shown === "detail"
        ? 195
        : shown === "context"
          ? Math.max(130, 90 / scale)
          : Math.max(96, 62 / scale);
  return {
    ...node,
    x: node.x + node.width / 2 - width / 2,
    y: node.y + node.height / 2 - height / 2,
    width,
    height,
  };
};
export function ModuleNode({
  node,
  model,
  scale,
  level,
  color,
  focused,
  emphasized,
  dimmed,
  blocked,
  onFocus,
  onAction,
  onHover,
  dragged,
}: {
  node: CanvasNode;
  model: CatalogModel;
  scale: number;
  level: DetailLevel;
  color: string | undefined;
  focused: boolean;
  emphasized: boolean;
  dimmed: boolean;
  blocked: ReadonlyArray<BlockedModule>;
  onFocus: () => void;
  onAction: () => void;
  onHover: (active: boolean) => void;
  dragged: () => boolean;
}) {
  const module = model.modules.find((m) => m.id === node.moduleId);
  const shown = level === "map" && emphasized ? "names" : level;
  const action =
    node.status === "pending"
      ? `Resolve ${node.title}`
      : node.status === "target"
        ? `Remove target ${node.title}`
        : node.status === "explicit"
          ? `Remove ${node.moduleId}`
          : node.status === "automatic"
            ? `Keep ${node.moduleId} explicitly`
            : `Add ${node.moduleId}`;
  const style: CSSProperties & {
    "--node-scale": number;
    "--node-color": string;
  } = {
    borderLeftColor: color,
    "--node-scale": Math.max(0.08, scale),
    "--node-color": color ?? "currentColor",
  };
  return (
    <foreignObject
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      className="node-position"
      style={{ opacity: dimmed ? 0.2 : 1 }}
    >
      <div
        data-node-id={node.id}
        data-discovery={node.discovery}
        data-detail={shown}
        className={`graph-node ${node.status} ${focused ? "focused" : ""} ${blocked.length ? "blocked" : ""}`}
        style={style}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        title={
          blocked.length
            ? blocked.map((b) => b.message).join("\n")
            : `${node.title}\n${module?.description ?? node.subtitle}\nSource: ${node.source}`
        }
      >
        <button
          className="node-body"
          onClick={() => {
            if (!dragged()) onFocus();
          }}
          onFocus={onFocus}
          aria-label={`Inspect ${node.moduleId ?? node.title}`}
        >
          <span className="node-title">{node.title}</span>
          <span className="node-meta">
            <span className="source-badge">{node.source}</span>
            {node.status === "automatic"
              ? "automatic"
              : node.status === "explicit"
                ? "chosen"
                : node.status === "pending"
                  ? "pending"
                  : module?.visibility === "internal"
                    ? "internal"
                    : ""}
          </span>
          {node.status === "catalog" &&
            (node.discovery === "next" || node.discovery === "available") && (
              <span className="node-discovery">
                {node.discovery === "next"
                  ? "Unlocked feature"
                  : "Available for your targets"}
              </span>
            )}
          {module && (
            <span className="node-description">{module.description}</span>
          )}
          {module && (
            <span className="node-relationships">
              {module.dependencies.length} requirements ·{" "}
              {module.implies?.length ?? 0} implications
              {module.conflictsWith?.length
                ? ` · ${module.conflictsWith.length} conflicts`
                : ""}
            </span>
          )}
          {shown === "detail" && !!module?.provides?.length && (
            <span className="node-capability">
              Provides {module.provides.join(", ")}
            </span>
          )}
          {node.status !== "catalog" && (
            <span className="node-owner">{node.subtitle}</span>
          )}
        </button>
        <button
          data-node-action
          className="node-action"
          aria-label={action}
          disabled={
            blocked.length > 0 ||
            (node.status === "automatic" && module?.visibility === "internal")
          }
          title={
            node.status === "automatic" && module?.visibility === "internal"
              ? "Included automatically; no separate selection needed"
              : undefined
          }
          onClick={(event) => {
            event.stopPropagation();
            onAction();
          }}
        >
          {node.status === "pending"
            ? "?"
            : node.status === "explicit" || node.status === "target"
              ? "−"
              : "+"}
        </button>
      </div>
    </foreignObject>
  );
}
