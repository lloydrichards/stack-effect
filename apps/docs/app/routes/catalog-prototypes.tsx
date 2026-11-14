import { CatalogService } from "@repo/catalog";
import { TargetIdentity } from "@repo/domain/Catalog";
import {
  CatalogSources,
  defaultCatalogSources,
  formatCatalogSource,
} from "@repo/domain/CatalogSource";
import { BlueprintService } from "@repo/scaffold/browser";
import { Effect, Option, Schema } from "effect";
import { ArrowRight, Copy, Network, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { DecisionCard } from "~/components/catalog-prototypes/decision-card";
import { GraphCanvas } from "~/components/catalog-prototypes/graph-canvas";
import { PrototypeInspector } from "~/components/catalog-prototypes/inspector";
import {
  prototypeLayout,
  type CanvasNode,
} from "~/components/catalog-prototypes/layout";
import { moduleAccessReason } from "~/components/catalog-prototypes/module-hierarchy";
import {
  addPick,
  conflictFor,
  emptySelection,
  ownerLabel,
  projectSelection,
  supports,
  removePick,
  toSelection,
  type WorkingSelection,
} from "~/components/catalog-prototypes/selection";
import {
  builderUrl,
  decodeExplorerUrl,
  encodeExplorerUrl,
  type Direction,
} from "~/components/catalog-prototypes/selection-url";
import { usePrototypeCatalog } from "~/components/catalog-prototypes/use-catalog";
import "~/components/catalog-prototypes/prototypes.css";
import "~/components/catalog-prototypes/canvas-shell.css";
import { organicVariants } from "~/components/catalog-prototypes/variants";

export default function CatalogPrototypesPage() {
  const [initialParams, setSearchParams] = useSearchParams();
  const [initial] = useState(() => decodeExplorerUrl(initialParams));
  const [direction, setDirection] = useState<Direction>(initial.direction);
  const [working, setWorking] = useState<WorkingSelection>(initial.state);
  const [sources, setSources] = useState<CatalogSources>(initial.sources);
  const [sourceText, setSourceText] = useState(
    initial.sources.map(formatCatalogSource).join("\n"),
  );
  const [sourceChange, setSourceChange] = useState<{
    sources: CatalogSources;
    affected: string[];
  }>();
  const [past, setPast] = useState<ReadonlyArray<WorkingSelection>>([]);
  const [focused, setFocused] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const focusNode = (id: string) => {
    setFocused(id);
    if (id) setInspectorOpen(true);
  };
  useEffect(() => {
    if (window.matchMedia("(max-width: 800px)").matches)
      setInspectorOpen(false);
  }, []);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [notice, setNotice] = useState("");
  const [issue, setIssue] = useState(initial.issue ?? "");
  const [review, setReview] = useState(false);
  const [validating, setValidating] = useState(false);
  const [targetFormOpen, setTargetFormOpen] = useState(false);
  const [newTargetKind, setNewTargetKind] = useState("");
  const [newTargetName, setNewTargetName] = useState("");
  const reviewRef = useRef<HTMLDialogElement>(null);
  const sourceReviewRef = useRef<HTMLDialogElement>(null);
  const targetCreatorRef = useRef<HTMLElement>(null);
  const { loaded, model, error } = usePrototypeCatalog(sources);
  const projection = useMemo(
    () => (model ? projectSelection(model, working) : undefined),
    [model, working],
  );
  useEffect(() => {
    if (projection?.decisions.length) setInspectorOpen(true);
  }, [projection?.decisions.length]);
  const layout = useMemo(
    () =>
      model && projection
        ? prototypeLayout(model, working, projection, direction)
        : undefined,
    [model, working, projection, direction],
  );
  const blocked = useMemo(
    () =>
      new Map(
        model?.modules.map((m) => [
          String(m.id),
          projectSelection(model, addPick(model, working, m.id)).conflicts,
        ]) ?? [],
      ),
    [model, working],
  );
  const commit = (next: WorkingSelection) => {
    setPast((p) => [...p.slice(-24), working]);
    setWorking(next);
    if (next.picks.length > working.picks.length) setInspectorOpen(true);
    setReview(false);
    setNotice("");
    setIssue("");
  };
  useEffect(() => {
    if (initial.issue) return;
    const params = encodeExplorerUrl(working, sources, direction);
    if (params.toString() !== initialParams.toString()) {
      setSearchParams(params, { replace: true, preventScrollReset: true });
    }
  }, [
    working,
    sources,
    direction,
    initial.issue,
    initialParams,
    setSearchParams,
  ]);
  useEffect(() => {
    if (review) reviewRef.current?.showModal();
  }, [review]);
  useEffect(() => {
    if (sourceChange) sourceReviewRef.current?.showModal();
  }, [sourceChange]);
  const canReview = Boolean(
    projection &&
    working.picks.length > 0 &&
    !projection.decisions.length &&
    !projection.conflicts.length &&
    !projection.issues.length &&
    !issue,
  );
  const applySources = (next: CatalogSources) => {
    if (!model) {
      setSources(next);
      setPast([]);
      return;
    }
    const retained = new Set<string>(next.map((s) => s.name));
    const changed = new Set<string>(
      sources
        .filter(
          (s) =>
            !next.some(
              (n) => formatCatalogSource(n) === formatCatalogSource(s),
            ),
        )
        .map((s) => s.name),
    );
    const requiring = loaded?.sources.filter(
      (s) =>
        retained.has(s.name) &&
        s.requires.includes("official") &&
        !retained.has("official"),
    );
    if (requiring?.length) {
      setIssue(
        `${requiring.map((s) => s.name).join(", ")} requires official. Keep official selected or remove the dependent sources too.`,
      );
      return;
    }
    const affected = [
      ...new Set([
        ...working.picks
          .filter((p) => changed.has(model.source("module", p.moduleId)))
          .map(
            (p) =>
              model.modules.find((m) => m.id === p.moduleId)?.title ??
              p.moduleId,
          ),
        ...(projection?.modules
          .filter((m) => changed.has(model.source("module", m.module.id)))
          .map((m) => m.module.title) ?? []),
        ...working.targets
          .filter((t) => changed.has(model.source("target", t.kind)))
          .map(ownerLabel),
      ]),
    ];
    if (affected.length) {
      setSourceChange({ sources: next, affected });
      return;
    }
    setSources(next);
    setPast([]);
    setSourceFilter("");
    setIssue("");
    setFocused("");
  };
  const nodeAction = (node: CanvasNode) => {
    if (!model || !projection) return;
    if (node.status === "pending") {
      setFocused(node.id);
      return;
    }
    if (node.status === "target") {
      commit({
        ...working,
        targets: working.targets.filter(
          (t) => `target:${t.toKey()}` !== node.id,
        ),
        picks: working.picks.filter(
          (p) => !p.owner || `target:${p.owner.toKey()}` !== node.id,
        ),
        bindings: {},
      });
      return;
    }
    const selected = projection.modules.find((m) => m.id === node.id);
    if (selected && node.status === "explicit") {
      commit(removePick(working, selected));
      return;
    }
    if (selected && node.status === "automatic") {
      commit({
        ...working,
        picks: [
          ...working.picks,
          {
            id: `pick:${selected.module.id}:${selected.owner.toKey()}`,
            moduleId: selected.module.id,
            kind: selected.owner.kind,
            owner: selected.owner,
          },
        ],
      });
      return;
    }
    if (node.status === "explicit") {
      commit({
        ...working,
        picks: working.picks.filter((p) => `intent:${p.id}` !== node.id),
      });
      return;
    }
    const target = projection.targets.find(
      (owner) =>
        `target:${owner.toKey()}` === focused &&
        model.modules.some(
          (module) => module.id === node.moduleId && supports(module, owner),
        ),
    );
    const candidate = model.modules.find(
      (module) => module.id === node.moduleId,
    );
    if (candidate && moduleAccessReason(model, projection, candidate, target))
      return;
    if (
      node.moduleId &&
      !conflictFor(model, working, node.moduleId, target?.kind ?? node.kind)
        .length
    ) {
      commit(
        addPick(
          model,
          working,
          node.moduleId,
          target?.kind ?? node.kind,
          target,
        ),
      );
      if (!target) setFocused("");
    }
  };
  const startReview = () => {
    if (!loaded || !projection || !canReview) return;
    setValidating(true);
    const program = Effect.gen(function* () {
      const service = yield* BlueprintService.make;
      return yield* service.resolve(toSelection(projection));
    }).pipe(
      Effect.provideService(CatalogService, loaded.catalog),
      Effect.match({
        onFailure: (failure) => {
          setIssue(`The selection could not be resolved: ${failure.message}`);
          setValidating(false);
        },
        onSuccess: () => {
          setReview(true);
          setValidating(false);
        },
      }),
    );
    void Effect.runPromiseExit(program);
  };
  const copyLink = () => {
    void Effect.runPromiseExit(
      Effect.tryPromise({
        try: () => navigator.clipboard.writeText(window.location.href),
        catch: () =>
          "Could not copy. Copy the address from your browser instead.",
      }).pipe(
        Effect.match({
          onSuccess: () =>
            setNotice("Selection link copied. Pending choices are preserved."),
          onFailure: setNotice,
        }),
      ),
    );
  };
  return (
    <section
      className={`catalog-prototypes canvas-shell organic variant-${direction} ${inspectorOpen ? "inspector-open" : "inspector-closed"}`}
    >
      <header className="prototype-heading">
        <div>
          <div className="prototype-eyebrow">STACK EFFECT / EXPLORER</div>
          <h1>Catalog canvas</h1>
          <p>Explore connections. Build a selection.</p>
        </div>
        <a href="/research/catalog-graphs/index.html">Research ↗</a>
      </header>
      <div className="prototype-direction" aria-label="Organic layout variants">
        {organicVariants.map((variant) => (
          <button
            key={variant.id}
            aria-pressed={direction === variant.id}
            onClick={() => setDirection(variant.id)}
          >
            <Network size={17} />
            <span>
              <strong>{variant.label}</strong>
              <small>{variant.description}</small>
            </span>
          </button>
        ))}
      </div>
      <button
        className="inspector-toggle"
        aria-expanded={inspectorOpen}
        onClick={() => setInspectorOpen((open) => !open)}
      >
        {inspectorOpen ? "Hide inspector" : "Show inspector"}
        {projection?.decisions.length
          ? ` · ${projection.decisions.length} pending`
          : ""}
      </button>
      <div className="prototype-toolbar">
        <button
          className="add-target-entry"
          onClick={() => {
            setInspectorOpen(true);
            setTargetFormOpen(true);
            requestAnimationFrame(() =>
              targetCreatorRef.current?.scrollIntoView({
                block: "start",
                behavior: "smooth",
              }),
            );
          }}
        >
          + Add targets
        </button>
        <label className="search-input">
          <span className="sr-only">Search modules</span>
          <input
            placeholder="Search modules or features…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (e.target.value.trim()) setInspectorOpen(true);
            }}
          />
        </label>
        <label>
          <span className="sr-only">Filter by source</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">All catalog sources</option>
            {sources.map((s) => (
              <option key={s.name}>{s.name}</option>
            ))}
          </select>
        </label>
        <button
          disabled={!past.length}
          onClick={() => {
            const previous = past.at(-1);
            if (previous) {
              setWorking(previous);
              setPast((p) => p.slice(0, -1));
              setIssue("");
            }
          }}
        >
          <Undo2 size={15} />
          Undo
        </button>
        <button onClick={copyLink}>
          <Copy size={15} />
          Share selection
        </button>
        <button
          className="primary"
          disabled={!canReview || validating}
          onClick={startReview}
        >
          {validating ? "Checking…" : "Review for Builder"}
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="prototype-summary" role="status">
        <span>
          <strong>{projection?.targets.length ?? 0}</strong> targets
        </span>
        <span>
          <strong>{working.picks.length}</strong> chosen modules
        </span>
        <span>
          <strong>
            {projection?.modules.filter((m) => !m.explicit).length ?? 0}
          </strong>{" "}
          automatic additions
        </span>
        <span className={projection?.decisions.length ? "pending-summary" : ""}>
          <strong>{projection?.decisions.length ?? 0}</strong> pending decisions
        </span>
        <span className="subtle">
          {model
            ? `${model.modules.length} catalog modules · ${sources.length} source${sources.length === 1 ? "" : "s"}`
            : "Loading catalog…"}
        </span>
      </div>
      <section className="prototype-sources-panel">
        <details>
          <summary>Catalog sources</summary>
          <p className="subtle">
            One source per line: official or name=https://…
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const raw = sourceText
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => {
                  const i = s.indexOf("=");
                  return i < 0
                    ? { name: s }
                    : { name: s.slice(0, i), url: s.slice(i + 1) };
                });
              const next = Schema.decodeUnknownOption(CatalogSources)(raw);
              if (Option.isNone(next)) {
                setIssue(
                  "Enter official or unique name=https://catalog.json sources. Use HTTPS, or HTTP on localhost for local catalogs.",
                );
                return;
              }
              applySources(next.value);
            }}
          >
            <label>
              Selected catalog sources
              <textarea
                rows={4}
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
              />
            </label>
            <button type="submit">Load catalogs</button>
          </form>
          {loaded?.sources.map((s) => (
            <p key={s.name} className="source-detail">
              <strong>{s.name}</strong> · {s.freshness}
              <br />
              {s.sourceUrl}
              {s.warning && <span>{s.warning.message}</span>}
            </p>
          ))}
        </details>
      </section>
      {(issue || error) && (
        <div className="prototype-alert" role="alert">
          {issue || error}
          {error && (
            <p>
              Check the source URL and whether its host permits browser
              requests. No partial catalog is displayed.
            </p>
          )}
          {issue && (
            <button
              onClick={() => {
                setIssue("");
                if (initial.issue) window.location.href = "/catalog-prototypes";
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
      {notice && (
        <div className="prototype-notice" role="status">
          {notice}
        </div>
      )}
      {model && projection && layout ? (
        <div className="prototype-workspace">
          <GraphCanvas
            layout={layout}
            direction={direction}
            model={model}
            projection={projection}
            focused={focused}
            onFocus={focusNode}
            onAction={nodeAction}
            onTargetKind={(kind) => {
              setInspectorOpen(true);
              setTargetFormOpen(true);
              setNewTargetKind(kind);
              setNewTargetName(
                model.targets.find((t) => t.kind === kind)?.defaultName ?? "",
              );
              requestAnimationFrame(() =>
                targetCreatorRef.current?.scrollIntoView({
                  block: "nearest",
                  behavior: "instant",
                }),
              );
            }}
            blocked={blocked}
            search={search}
            sourceFilter={sourceFilter}
          />
          <aside
            className="prototype-sidebar"
            aria-label="Selection inspector and decisions"
          >
            <section ref={targetCreatorRef}>
              <h2>Your targets</h2>
              <p className="subtle">
                Focus a target to discover compatible modules. Add modules from
                the list or canvas.
              </p>
              <div className="selected-target-list">
                {projection.targets.map((owner) => (
                  <button
                    key={owner.toKey()}
                    aria-pressed={focused === `target:${owner.toKey()}`}
                    onClick={() => focusNode(`target:${owner.toKey()}`)}
                  >
                    {ownerLabel(owner)}
                  </button>
                ))}
              </div>
              <details
                open={targetFormOpen}
                onToggle={(event) =>
                  setTargetFormOpen(event.currentTarget.open)
                }
              >
                <summary>Add a target</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const decoded = Schema.decodeOption(TargetIdentity)({
                      kind: newTargetKind,
                      name: newTargetName.trim(),
                    });
                    if (Option.isNone(decoded)) {
                      setIssue(
                        "Choose a target kind and a valid name. Packages require a name.",
                      );
                      return;
                    }
                    if (
                      working.targets.some(
                        (t) => t.toKey() === decoded.value.toKey(),
                      )
                    ) {
                      setIssue("That target already exists in your selection.");
                      return;
                    }
                    commit({
                      ...working,
                      targets: [...working.targets, decoded.value],
                    });
                    focusNode(`target:${decoded.value.toKey()}`);
                    setTargetFormOpen(false);
                    setNewTargetName("");
                  }}
                >
                  <label>
                    Target kind
                    <select
                      value={newTargetKind}
                      onChange={(e) => {
                        setNewTargetKind(e.target.value);
                        setNewTargetName(
                          model.targets.find((t) => t.kind === e.target.value)
                            ?.defaultName ?? "",
                        );
                      }}
                    >
                      <option value="">Choose target kind</option>
                      {model.targets.map((t) => (
                        <option key={t.kind} value={t.kind}>
                          {t.kind}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Name
                    <input
                      placeholder="For example, api or web"
                      value={newTargetName}
                      onChange={(e) => setNewTargetName(e.target.value)}
                    />
                  </label>
                  <button type="submit" disabled={!newTargetKind}>
                    Create target
                  </button>
                </form>
              </details>
            </section>

            <PrototypeInspector
              model={model}
              working={working}
              projection={projection}
              layout={layout}
              search={search}
              sourceFilter={sourceFilter}
              focused={focused}
              blocked={blocked}
              setFocused={focusNode}
              nodeAction={nodeAction}
              commit={commit}
            />
            <section>
              <h2>
                Pending decisions <span>{projection.decisions.length}</span>
              </h2>
              {projection.decisions.length ? (
                projection.decisions.map((d) => (
                  <DecisionCard
                    key={`${d.id}:${d.type === "target" ? d.kind : "provider"}`}
                    decision={d}
                    model={model}
                    working={working}
                    focused={focused === d.id}
                    onFocus={() => setFocused(d.id)}
                    onChange={commit}
                  />
                ))
              ) : (
                <p className="subtle">
                  {working.picks.length
                    ? "All current choices are resolved. Review your selection when ready."
                    : "Choose a module to begin. Target and provider choices will appear here and in the graph."}
                </p>
              )}
            </section>
            {!!projection.conflicts.length && (
              <section className="conflict-explanation">
                <h2>Selection conflicts</h2>
                {projection.conflicts.map((c, i) => (
                  <p key={i}>{c.message}</p>
                ))}
                <p>
                  Remove a conflicting explicit selection before continuing.
                </p>
              </section>
            )}
            {!!projection.issues.length && (
              <section role="alert">
                {projection.issues.map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </section>
            )}

            <button
              className="reset-selection"
              onClick={() => {
                commit(emptySelection);
                setFocused("");
              }}
            >
              Clear selection
            </button>
          </aside>
        </div>
      ) : (
        <div className="prototype-loading">
          {error ? (
            <>
              <p>Catalog loading failed.</p>
              <button
                onClick={() => {
                  setSources([...defaultCatalogSources]);
                  setSourceText("official");
                }}
              >
                Load official catalog
              </button>
            </>
          ) : (
            "Loading and validating catalog sources…"
          )}
        </div>
      )}
      {sourceChange && (
        <dialog
          ref={sourceReviewRef}
          className="source-confirm"
          aria-labelledby="source-confirm-title"
          onClose={() => setSourceChange(undefined)}
        >
          <div>
            <h2 id="source-confirm-title">Review catalog change</h2>
            <p>
              Changing these sources affects the following selected definitions.
              Their explicit picks will be removed, and automatic dependencies
              will be recalculated.
            </p>
            <ul>
              {sourceChange.affected.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <button onClick={() => setSourceChange(undefined)}>Cancel</button>
            <button
              className="primary"
              onClick={() => {
                if (!model) return;
                const changed = new Set<string>(
                  sources
                    .filter(
                      (s) =>
                        !sourceChange.sources.some(
                          (n) =>
                            formatCatalogSource(n) === formatCatalogSource(s),
                        ),
                    )
                    .map((s) => s.name),
                );
                commit({
                  targets: working.targets.filter(
                    (t) => !changed.has(model.source("target", t.kind)),
                  ),
                  picks: working.picks.filter(
                    (p) =>
                      !changed.has(model.source("module", p.moduleId)) &&
                      (!p.owner ||
                        !changed.has(model.source("target", p.owner.kind))),
                  ),
                  bindings: {},
                });
                setSources(sourceChange.sources);
                setPast([]);
                setSourceFilter("");
                setSourceChange(undefined);
                setFocused("");
              }}
            >
              Confirm catalog change
            </button>
          </div>
        </dialog>
      )}
      <dialog
        ref={reviewRef}
        className="review-dialog"
        onClose={() => setReview(false)}
      >
        <div className="sidebar-section-title">
          <h2>Ready for Builder</h2>
          <button
            aria-label="Close review"
            onClick={() => reviewRef.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <p>
          The completed target/module set has passed Blueprint validation.
          Builder handles configuration and generated files.
        </p>
        {projection?.targets.map((owner) => (
          <section key={owner.toKey()}>
            <h3>{ownerLabel(owner)}</h3>
            <ul>
              {projection.modules
                .filter((m) => m.owner.toKey() === owner.toKey())
                .map((m) => (
                  <li key={m.id}>
                    {m.module.title}
                    <span>{m.explicit ? "Chosen" : "Automatic"}</span>
                    {!m.explicit && (
                      <small>
                        {projection.links
                          .filter((l) => l.to === m.id)
                          .map(
                            (l) =>
                              `${l.reason}: ${layout?.nodes.find((n) => n.id === l.from)?.title ?? l.from}`,
                          )
                          .join("; ")}
                      </small>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}
        {projection && (
          <Link
            className="builder-handoff"
            to={builderUrl(projection, sources)}
          >
            Continue in Builder <ArrowRight size={16} />
          </Link>
        )}
      </dialog>
    </section>
  );
}
