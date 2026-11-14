import { X } from "lucide-react";
import type { BlockedModule } from "./graph-canvas";
import type { CanvasLayout, CanvasNode } from "./layout";
import { moduleAccessReason, moduleParents } from "./module-hierarchy";
import {
  ownerLabel,
  supports,
  projectSelection,
  type CatalogModel,
  type SelectionProjection,
  type WorkingSelection,
} from "./selection";
import { TargetModuleTree } from "./target-module-tree";
type Props = {
  model: CatalogModel;
  working: WorkingSelection;
  projection: SelectionProjection;
  layout: CanvasLayout;
  search: string;
  sourceFilter: string;
  focused: string;
  blocked: ReadonlyMap<string, ReadonlyArray<BlockedModule>>;
  setFocused: (id: string) => void;
  nodeAction: (node: CanvasNode) => void;
  commit: (next: WorkingSelection) => void;
};
export function PrototypeInspector({
  model,
  working,
  projection,
  layout,
  search,
  sourceFilter,
  focused,
  blocked,
  setFocused,
  nodeAction,
  commit,
}: Props) {
  const apply = (next: WorkingSelection) => {
    if (projectSelection(model, next).conflicts.length === 0) commit(next);
  };
  const focusedNode = layout.nodes.find((n) => n.id === focused);
  const focusedModule = model.modules.find(
    (m) => m.id === focusedNode?.moduleId,
  );
  const focusedKind = model.targets.find(
    (target) => `hub:${target.kind}` === focused,
  );
  const selectedModule = projection.modules.find((m) => m.id === focused);
  const focusedDecision = projection.decisions.find((d) => d.id === focused);
  const searchResults = model.modules
    .filter(
      (m) =>
        `${m.title} ${m.id}`.toLowerCase().includes(search.toLowerCase()) &&
        (!sourceFilter || model.source("module", m.id) === sourceFilter),
    )
    .slice(0, 16);
  return (
    <>
      {search && (
        <section>
          <h2>
            Search results{" "}
            <span>
              {searchResults.length}
              {searchResults.length === 16 ? "+" : ""}
            </span>
          </h2>
          <div className="module-results">
            {searchResults.map((m) => {
              const node = layout.nodes.find((n) => n.moduleId === m.id);
              return (
                <div key={m.id}>
                  <button
                    aria-label={`Inspect search result ${m.id}`}
                    onClick={() => node && setFocused(node.id)}
                  >
                    {m.title}
                    <small>{m.id}</small>
                  </button>
                  {node && (
                    <button
                      aria-label={`${node.status === "catalog" ? "Add result" : "Inspect result"} ${m.id}`}
                      disabled={
                        node.status === "catalog" &&
                        ((blocked.get(m.id)?.length ?? 0) > 0 ||
                          Boolean(moduleAccessReason(model, projection, m)))
                      }
                      title={moduleAccessReason(model, projection, m)}
                      onClick={() =>
                        node.status === "catalog"
                          ? nodeAction(node)
                          : setFocused(node.id)
                      }
                    >
                      {node.status === "catalog" ? "+" : "↗"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      <section className="inspector-section">
        <div className="sidebar-section-title">
          <h2>{focusedDecision ? "Resolve a decision" : "Module inspector"}</h2>
          {focused && (
            <button aria-label="Clear focus" onClick={() => setFocused("")}>
              <X size={15} />
            </button>
          )}
        </div>
        {focusedKind ? (
          <>
            <h3>{focusedKind.title}</h3>
            <p>{focusedKind.description}</p>
            <p className="subtle">
              {model.source("target", focusedKind.kind)} · drag this anchor to
              move its neighborhood.
            </p>
          </>
        ) : focusedNode?.status === "target" ? (
          <>
            <h3>{focusedNode.title}</h3>
            <p>
              {
                model.targets.find((t) => t.kind === focusedNode.kind)
                  ?.description
              }
            </p>
            <p className="subtle">Source: {focusedNode.source}</p>
            <p>
              {
                projection.modules.filter(
                  (m) => `target:${m.owner.toKey()}` === focusedNode.id,
                ).length
              }{" "}
              modules attached to this target.
            </p>
            {projection.targets
              .filter((owner) => `target:${owner.toKey()}` === focusedNode.id)
              .map((owner) => (
                <TargetModuleTree
                  key={owner.toKey()}
                  model={model}
                  owner={owner}
                  working={working}
                  projection={projection}
                  onChange={apply}
                  onFocus={setFocused}
                />
              ))}
            <button
              className="inspector-action"
              onClick={() => nodeAction(focusedNode)}
            >
              Remove target and its explicit selections
            </button>
          </>
        ) : focusedModule && focusedNode ? (
          <>
            <div className="module-id">{focusedModule.id}</div>
            <h3>{focusedModule.title}</h3>
            <p>{focusedModule.description}</p>
            <div className="inspector-badges">
              <span>{model.source("module", focusedModule.id)}</span>
              <span>
                {focusedNode.status === "catalog"
                  ? "Available"
                  : focusedNode.status === "automatic"
                    ? "Automatic addition"
                    : "Explicitly chosen"}
              </span>
              {focusedModule.visibility === "internal" && <span>Internal</span>}
            </div>
            <p className="subtle">
              Supports{" "}
              {focusedModule.supportedOn
                .map((rule) =>
                  rule._tag === "kind"
                    ? `${rule.kind} targets`
                    : ownerLabel(rule.identity),
                )
                .join(", ")}
            </p>
            {!!moduleParents(model, focusedModule.id).length && (
              <div className="feature-parent">
                <h4>Feature of</h4>
                {moduleParents(model, focusedModule.id).map((parent) => (
                  <button
                    key={parent.id}
                    onClick={() =>
                      setFocused(
                        projection.modules.find(
                          (entry) =>
                            entry.module.id === parent.id &&
                            (!selectedModule ||
                              entry.owner.toKey() ===
                                selectedModule.owner.toKey()),
                        )?.id ?? `catalog:${parent.id}`,
                      )
                    }
                  >
                    {parent.title}
                  </button>
                ))}
              </div>
            )}
            {focusedNode.status === "catalog" &&
            (blocked.get(focusedModule.id)?.length ?? 0) > 0 ? (
              <div className="conflict-explanation">
                <strong>Unavailable with this selection</strong>
                {blocked.get(focusedModule.id)?.map((conflict, i) => (
                  <p key={i}>{conflict.message}</p>
                ))}
              </div>
            ) : focusedNode.status === "catalog" &&
              moduleAccessReason(model, projection, focusedModule) ? (
              <p className="subtle">
                {moduleAccessReason(model, projection, focusedModule)}
              </p>
            ) : focusedNode.status === "automatic" &&
              focusedModule.visibility === "internal" ? (
              <p className="subtle">
                Included automatically. No separate selection needed.
              </p>
            ) : (
              <button
                className="inspector-action"
                onClick={() => nodeAction(focusedNode)}
              >
                {focusedNode.status === "automatic"
                  ? "Keep explicitly"
                  : focusedNode.status === "explicit"
                    ? "Remove from selection"
                    : "Add to selection"}
              </button>
            )}
            <h4>
              {selectedModule ? "Why it is here" : "Declared relationships"}
            </h4>
            {selectedModule ? (
              <ul className="reason-list">
                {projection.links
                  .filter((l) => l.to === selectedModule.id)
                  .map((l, i) => (
                    <li key={i}>
                      <button onClick={() => setFocused(l.from)}>
                        {layout.nodes.find((n) => n.id === l.from)?.title ??
                          l.from}
                      </button>
                      <span>{l.reason}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <>
                <p className="subtle">
                  {focusedModule.dependencies.length} requirements ·{" "}
                  {focusedModule.implies?.length ?? 0} implications ·{" "}
                  {focusedModule.conflictsWith?.length ?? 0} conflicts
                </p>
                {focusedModule.dependencies.map((d, i) => (
                  <p className="declaration" key={i}>
                    {d._tag === "required-target"
                      ? `Requires ${ownerLabel(d.identity)}`
                      : d._tag === "required-module"
                        ? `Requires ${d.moduleId} on ${ownerLabel(d.target)}`
                        : `Needs ${d.capability} on ${ownerLabel(d.target)}`}
                  </p>
                ))}
              </>
            )}
            {selectedModule && !!focusedModule.children?.length && (
              <TargetModuleTree
                model={model}
                owner={selectedModule.owner}
                working={working}
                projection={projection}
                onChange={apply}
                onFocus={setFocused}
                entryModuleId={focusedModule.id}
              />
            )}
            {!selectedModule && !!focusedModule.children?.length && (
              <>
                <h4>Features beneath this module</h4>
                <ul className="reason-list">
                  {focusedModule.children.map((child) => (
                    <li key={child.moduleId}>
                      <button
                        onClick={() =>
                          setFocused(
                            projection.modules.find(
                              (entry) => entry.module.id === child.moduleId,
                            )?.id ?? `catalog:${child.moduleId}`,
                          )
                        }
                      >
                        {model.modules.find(
                          (entry) => entry.id === child.moduleId,
                        )?.title ?? child.moduleId}
                      </button>
                      <span>
                        {child.requirement === "required"
                          ? "Included automatically"
                          : "Optional feature · enable in the target's module tree"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {selectedModule && (
              <details>
                <summary>Add to another target</summary>
                {working.targets
                  .filter(
                    (t) =>
                      supports(focusedModule, t) &&
                      !working.picks.some(
                        (p) =>
                          p.owner?.toKey() === t.toKey() &&
                          p.moduleId === focusedModule.id,
                      ),
                  )
                  .map((t) => (
                    <button
                      className="choice-button"
                      key={t.toKey()}
                      onClick={() =>
                        apply({
                          ...working,
                          picks: [
                            ...working.picks,
                            {
                              id: `pick:${focusedModule.id}:${t.toKey()}`,
                              moduleId: focusedModule.id,
                              kind: t.kind,
                              owner: t,
                            },
                          ],
                        })
                      }
                    >
                      Add to {ownerLabel(t)}
                    </button>
                  ))}
              </details>
            )}
          </>
        ) : (
          !focusedDecision && (
            <>
              <h3>Explore, then choose.</h3>
              <p>
                Click a module to highlight its connections. Use + to choose it.
                Selected modules move above the remaining catalog.
              </p>
              <p className="subtle">
                Automatic additions share one node per target identity. Their
                incoming branches explain why they are needed. Source badges
                remain visible in both directions.
              </p>
            </>
          )
        )}
      </section>
    </>
  );
}
