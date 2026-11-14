import { TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { Schema, Option } from "effect";
import { useEffect, useRef, useState } from "react";
import {
  type CatalogModel,
  type Decision,
  type WorkingSelection,
  resolveTargetDecision,
  chooseProvider,
  projectSelection,
  suggestedTarget,
  ownerLabel,
  supportedKinds,
} from "./selection";
export function DecisionCard({
  decision,
  model,
  working,
  onChange,
  focused,
  onFocus,
}: {
  decision: Decision;
  model: CatalogModel;
  working: WorkingSelection;
  onChange: (next: WorkingSelection) => void;
  focused: boolean;
  onFocus: () => void;
}) {
  const proposed =
    decision.type === "target" ? suggestedTarget(model, decision) : undefined;
  const [name, setName] = useState(proposed?.name ?? "");
  const [error, setError] = useState("");
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focused)
      cardRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "instant",
      });
  }, [focused]);
  return (
    <article
      ref={cardRef}
      className={`decision-card ${focused ? "active" : ""}`}
    >
      <button
        className="decision-title"
        aria-label={`Locate decision ${decision.title}`}
        onClick={onFocus}
      >
        {decision.title}
      </button>
      <p className="subtle">
        {decision.type === "provider"
          ? `${ownerLabel(decision.owner)} · choose exactly one provider`
          : decision.exact
            ? `Required identity: ${ownerLabel(decision.exact)}`
            : `Needed by ${model.modules.find((m) => decision.from.includes(m.id))?.title ?? "your selection"}`}
      </p>
      {decision.type === "provider" ? (
        <div className="decision-options">
          {decision.providers.map((module) => {
            const next = chooseProvider(working, decision, module.id);
            const conflicts = projectSelection(model, next).conflicts;
            return (
              <button
                key={module.id}
                disabled={conflicts.length > 0}
                title={conflicts.map((c) => c.message).join("\n")}
                onClick={() => onChange(next)}
              >
                {module.title}
                <span>{model.source("module", module.id)}</span>
              </button>
            );
          })}
          {!decision.providers.length && (
            <p role="alert">
              No eligible providers in the loaded catalogs. Remove the
              requesting module or load a catalog that provides this capability.
            </p>
          )}
        </div>
      ) : (
        <>
          {decision.pickId &&
            (() => {
              const module = model.modules.find(
                (m) => m.id === decision.moduleId,
              );
              const kinds = module ? supportedKinds(module) : [];
              return kinds.length > 1 ? (
                <label>
                  Target kind
                  <select
                    value={decision.kind}
                    onChange={(event) =>
                      onChange({
                        ...working,
                        picks: working.picks.map((p) =>
                          p.id === decision.pickId
                            ? {
                                ...p,
                                kind: event.target.value,
                                owner: undefined,
                              }
                            : p,
                        ),
                      })
                    }
                  >
                    {kinds.map((kind) => (
                      <option key={kind}>{kind}</option>
                    ))}
                  </select>
                </label>
              ) : null;
            })()}
          {decision.candidates.map((owner) => (
            <button
              className="choice-button"
              key={owner.toKey()}
              disabled={
                projectSelection(
                  model,
                  resolveTargetDecision(working, decision, owner),
                ).conflicts.length > 0
              }
              title={projectSelection(
                model,
                resolveTargetDecision(working, decision, owner),
              )
                .conflicts.map((c) => c.message)
                .join("\n")}
              onClick={() =>
                onChange(resolveTargetDecision(working, decision, owner))
              }
            >
              Use {ownerLabel(owner)}
            </button>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const decoded = Schema.decodeOption(TargetIdentity)({
                kind: TargetKind.make(decision.kind),
                name: decision.exact?.name ?? name.trim(),
              });
              if (Option.isNone(decoded)) {
                setError(
                  "Enter a valid target name. Package targets require a name.",
                );
                return;
              }
              const owner = decoded.value;
              const next = resolveTargetDecision(working, decision, owner);
              const conflicts = projectSelection(model, next).conflicts;
              if (conflicts.length) {
                setError(conflicts.map((c) => c.message).join(" "));
                return;
              }
              onChange(next);
            }}
          >
            <label>
              {decision.exact ? "Required target name" : "New target name"}
              <input
                aria-label={`Target name for ${decision.title}`}
                value={decision.exact?.name ?? name}
                readOnly={decision.exact !== undefined}
                onChange={(e) => setName(e.target.value)}
                placeholder="Target name"
              />
            </label>
            <button className="choice-button" type="submit">
              {decision.exact
                ? `Create ${ownerLabel(decision.exact)}`
                : `Create ${decision.kind} target`}
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
        </>
      )}
    </article>
  );
}
