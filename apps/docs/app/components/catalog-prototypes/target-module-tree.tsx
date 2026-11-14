import type { TargetIdentity } from "@repo/domain/Catalog";
import { moduleAccessReason, targetEntryModules } from "./module-hierarchy";
import {
  addPick,
  ownerLabel,
  projectSelection,
  supports,
  type CatalogModel,
  type WorkingSelection,
  type SelectionProjection,
} from "./selection";

type Props = {
  model: CatalogModel;
  owner: TargetIdentity;
  working: WorkingSelection;
  projection: SelectionProjection;
  onChange: (next: WorkingSelection) => void;
  onFocus: (id: string) => void;
  entryModuleId?: string;
};
export function TargetModuleTree({
  model,
  owner,
  working,
  projection,
  onChange,
  onFocus,
  entryModuleId,
}: Props) {
  const renderModule = (
    module: CatalogModel["modules"][number],
    path: ReadonlyArray<string> = [],
    requirement?: string,
  ) => {
    if (path.includes(module.id)) return null;
    const selected = projection.modules.find(
      (entry) =>
        entry.module.id === module.id && entry.owner.toKey() === owner.toKey(),
    );
    const next = addPick(model, working, module.id, owner.kind, owner);
    const conflicts = projectSelection(model, next).conflicts;
    const access = moduleAccessReason(model, projection, module, owner);
    const automatic =
      requirement === "required" || module.visibility === "internal";
    const children = (module.children ?? []).flatMap((child) => {
      const definition = model.modules.find(
        (entry) => entry.id === child.moduleId,
      );
      return definition && supports(definition, owner)
        ? [{ definition, requirement: child.requirement }]
        : [];
    });
    return (
      <li key={module.id}>
        <div className="hierarchy-row">
          <button
            className="hierarchy-label"
            aria-label={`Inspect feature ${module.id} on ${ownerLabel(owner)}`}
            onClick={() => onFocus(selected?.id ?? `catalog:${module.id}`)}
          >
            <strong>{module.title}</strong>
            <small>
              {automatic
                ? "Automatic"
                : requirement === "optional"
                  ? "Optional feature"
                  : "Add to target"}{" "}
              · {model.source("module", module.id)}
              {selected
                ? selected.explicit
                  ? " · chosen"
                  : " · included automatically"
                : ""}
            </small>
          </button>
          {!automatic && (
            <button
              aria-label={`Add ${module.id} to ${ownerLabel(owner)}`}
              disabled={Boolean(selected || access || conflicts.length)}
              title={
                access ??
                conflicts.map((conflict) => conflict.message).join("\n")
              }
              onClick={() => onChange(next)}
            >
              {selected ? "✓" : "+"}
            </button>
          )}
        </div>
        {!!module.dependencies.length && (
          <details className="hierarchy-requirements">
            <summary>
              Brings in {module.dependencies.length} requirements
            </summary>
            <ul>
              {module.dependencies.map((dependency, i) => (
                <li key={i}>
                  {dependency._tag === "required-module"
                    ? `${model.modules.find((entry) => entry.id === dependency.moduleId)?.title ?? dependency.moduleId} · automatic on ${ownerLabel(dependency.target)}`
                    : dependency._tag === "required-target"
                      ? `Target ${ownerLabel(dependency.identity)}`
                      : `${dependency.capability} · choose a provider on ${ownerLabel(dependency.target)}`}
                </li>
              ))}
            </ul>
          </details>
        )}
        {!!children.length && (
          <ul>
            {children.map((child) =>
              renderModule(
                child.definition,
                [...path, module.id],
                child.requirement,
              ),
            )}
          </ul>
        )}
      </li>
    );
  };
  const automatic = projection.modules.filter(
    (entry) =>
      !entry.explicit &&
      entry.owner.toKey() === owner.toKey() &&
      entry.module.visibility === "internal",
  );
  return (
    <>
      <h4>Modules and optional features</h4>
      <p className="subtle">
        Choose a module first, then enable its optional features below it.
        Requirements are brought in automatically.
      </p>
      <ul className="module-hierarchy">
        {(entryModuleId
          ? model.modules.filter((module) => module.id === entryModuleId)
          : targetEntryModules(model, owner)
        ).map((module) => renderModule(module))}
      </ul>
      {!!automatic.length && (
        <details>
          <summary>Automatic support modules ({automatic.length})</summary>
          <ul className="reason-list">
            {automatic.map((entry) => (
              <li key={entry.id}>
                <button onClick={() => onFocus(entry.id)}>
                  {entry.module.title}
                </button>
                <span>
                  Included automatically · no separate selection needed
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
