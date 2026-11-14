import type { CatalogService } from "@repo/catalog";
import {
  type ModuleDefinition,
  type TargetDefinition,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import type { Selection } from "@repo/domain/Selection";
import { Graph, Option } from "effect";

export type CatalogModel = {
  modules: ReadonlyArray<typeof ModuleDefinition.Type>;
  targets: ReadonlyArray<typeof TargetDefinition.Type>;
  source: (kind: "target" | "module", id: string) => string;
};
export const catalogModel = (
  catalog: typeof CatalogService.Service,
): CatalogModel => ({
  modules: catalog.getModules(),
  targets: Array.from(Graph.entries(Graph.nodes(catalog.toGraph))).flatMap(
    ([, n]) => (n._tag === "target" ? [n.definition] : []),
  ),
  source: (kind, id) =>
    Option.getOrElse(
      catalog.getSource(
        kind === "target" ? { _tag: kind, kind: id } : { _tag: kind, id },
      ),
      () => "catalog",
    ),
});
export const ownerLabel = (owner: TargetIdentity) =>
  `${owner.kind}/${owner.name}`;
export const moduleKey = (owner: TargetIdentity, id: string) =>
  `${owner.toKey()}#${id}`;
export type Pick = {
  id: string;
  moduleId: string;
  kind: string;
  owner?: TargetIdentity | undefined;
};
export type WorkingSelection = {
  targets: ReadonlyArray<TargetIdentity>;
  picks: ReadonlyArray<Pick>;
  bindings: Readonly<Record<string, string>>;
};
export const emptySelection: WorkingSelection = {
  targets: [],
  picks: [],
  bindings: {},
};
export type SelectedModule = {
  id: string;
  module: typeof ModuleDefinition.Type;
  owner: TargetIdentity;
  explicit: boolean;
};
export type SelectionLink = { from: string; to: string; reason: string };
export type TargetDecision = {
  type: "target";
  id: string;
  from: string;
  title: string;
  kind: string;
  moduleId?: string | undefined;
  exact?: TargetIdentity | undefined;
  candidates: ReadonlyArray<TargetIdentity>;
  pickId?: string | undefined;
};
export type ProviderDecision = {
  type: "provider";
  id: string;
  from: string;
  title: string;
  owner: TargetIdentity;
  capability: string;
  providers: ReadonlyArray<typeof ModuleDefinition.Type>;
};
export type Decision = TargetDecision | ProviderDecision;
export type SelectionProjection = {
  targets: ReadonlyArray<TargetIdentity>;
  modules: ReadonlyArray<SelectedModule>;
  links: ReadonlyArray<SelectionLink>;
  decisions: ReadonlyArray<Decision>;
  conflicts: ReadonlyArray<{ left: string; right: string; message: string }>;
  issues: ReadonlyArray<string>;
};
export const supports = (
  module: typeof ModuleDefinition.Type,
  owner: TargetIdentity,
) => module.supportedOn.some((rule) => owner.matches(rule));
export const supportedKinds = (module: typeof ModuleDefinition.Type) => [
  ...new Set(
    module.supportedOn.map((rule) =>
      rule._tag === "kind" ? rule.kind : rule.identity.kind,
    ),
  ),
];
export const newIdentity = (kind: string, name: string) =>
  new TargetIdentity({ kind: TargetKind.make(kind), name });
const uniqueTargets = (targets: ReadonlyArray<TargetIdentity>) => [
  ...new Map(targets.map((t) => [t.toKey(), t])).values(),
];

export const addPick = (
  model: CatalogModel,
  state: WorkingSelection,
  moduleId: string,
  preferredKind?: string,
  preferredOwner?: TargetIdentity,
): WorkingSelection => {
  const module = model.modules.find((m) => m.id === moduleId);
  if (!module) return state;
  const kind = preferredKind ?? supportedKinds(module)[0] ?? "package";
  const candidates = state.targets.filter(
    (t) => t.kind === kind && supports(module, t),
  );
  const owner =
    preferredOwner &&
    candidates.some((candidate) => candidate.toKey() === preferredOwner.toKey())
      ? preferredOwner
      : candidates.length === 1
        ? candidates[0]
        : undefined;
  const id = `pick:${moduleId}:${owner?.toKey() ?? kind}`;
  return state.picks.some((p) => p.id === id)
    ? state
    : {
        ...state,
        picks: [
          ...state.picks,
          { id, moduleId, kind, ...(owner ? { owner } : {}) },
        ],
      };
};

export const projectSelection = (
  model: CatalogModel,
  working: WorkingSelection,
): SelectionProjection => {
  const modules = new Map(model.modules.map((m) => [String(m.id), m]));
  const targets = new Map(model.targets.map((t) => [String(t.kind), t]));
  const selected = new Map<string, SelectedModule>();
  const usedTargets = new Map<string, TargetIdentity>();
  const decisions = new Map<string, Decision>();
  const links = new Map<string, SelectionLink>();
  const issues = new Set<string>();
  const explicit = new Set(
    working.picks.flatMap((p) =>
      p.owner ? [moduleKey(p.owner, p.moduleId)] : [],
    ),
  );
  const link = (from: string, to: string, reason: string) => {
    if (from !== to) links.set(`${from}|${to}|${reason}`, { from, to, reason });
  };
  const pending = (decision: Decision) => {
    decisions.set(decision.id, decision);
    link(decision.from, decision.id, "Decision needed");
  };
  const findTarget = (
    kind: string,
    from: string,
    id: string,
    moduleId?: string,
    exact?: TargetIdentity,
    pickId?: string,
  ): TargetIdentity | undefined => {
    const module = moduleId ? modules.get(moduleId) : undefined;
    const candidates = working.targets.filter(
      (t) =>
        t.kind === kind &&
        (!exact || t.toKey() === exact.toKey()) &&
        (!module || supports(module, t)),
    );
    const binding = working.bindings[id];
    const matched = candidates.find((t) => ownerLabel(t) === binding);
    const chosen =
      matched ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (chosen) return chosen;
    pending({
      type: "target",
      id,
      from,
      kind,
      moduleId,
      exact,
      candidates,
      pickId,
      title: `${candidates.length ? "Choose" : "Create"} ${exact ? ownerLabel(exact) : kind} target`,
    });
    return undefined;
  };
  const ensureTarget = (owner: TargetIdentity) => {
    if (usedTargets.has(owner.toKey())) return;
    usedTargets.set(owner.toKey(), owner);
    const definition = targets.get(owner.kind);
    if (!definition) {
      issues.add(`Unknown target kind: ${owner.kind}`);
      return;
    }
    (definition.requiredModules ?? []).forEach((id) =>
      visit(owner, id, `target:${owner.toKey()}`, "Required by target"),
    );
  };
  const dependencyOwner = (owner: TargetIdentity, declared: TargetIdentity) =>
    declared.kind === "workspace"
      ? (working.targets.find((t) => t.kind === "workspace") ?? declared)
      : declared.kind !== "package" && declared.kind === owner.kind
        ? owner
        : declared;
  const visit = (
    owner: TargetIdentity,
    moduleId: string,
    from: string,
    reason: string,
  ) => {
    const id = moduleKey(owner, moduleId);
    link(from, id, reason);
    if (selected.has(id)) return;
    const module = modules.get(moduleId);
    if (!module || !supports(module, owner)) {
      issues.add(`${moduleId} is not supported on ${ownerLabel(owner)}.`);
      return;
    }
    selected.set(id, { id, module, owner, explicit: explicit.has(id) });
    ensureTarget(owner);
    module.dependencies.forEach((dep) => {
      const declared =
        dep._tag === "required-target" ? dep.identity : dep.target;
      const required = dependencyOwner(owner, declared);
      const target = findTarget(
        required.kind,
        id,
        `target:${required.toKey()}`,
        dep._tag === "required-module" ? dep.moduleId : undefined,
        required,
      );
      if (!target) return;
      ensureTarget(target);
      if (dep._tag === "required-target") {
        link(id, `target:${target.toKey()}`, "Requires target");
        return;
      }
      if (dep._tag === "required-module") {
        visit(target, dep.moduleId, id, "Requires module");
        return;
      }
      const providers = model.modules.filter(
        (m) =>
          (m.provides ?? []).includes(dep.capability) && supports(m, target),
      );
      const chosen = working.picks.filter(
        (p) =>
          p.owner?.toKey() === target.toKey() &&
          providers.some((m) => m.id === p.moduleId),
      );
      const provider =
        chosen.length === 1
          ? modules.get(chosen[0]!.moduleId)
          : providers.length === 1 && chosen.length === 0
            ? providers[0]
            : undefined;
      if (provider)
        visit(target, provider.id, id, `Provides ${dep.capability}`);
      else
        pending({
          type: "provider",
          id: `provider:${target.toKey()}:${dep.capability}`,
          from: id,
          owner: target,
          capability: dep.capability,
          providers,
          title: `Choose ${dep.capability} provider${chosen.length > 1 ? " — keep exactly one" : ""}`,
        });
    });
    (module.children ?? [])
      .filter((child) => child.requirement === "required")
      .forEach((child) => visit(owner, child.moduleId, id, "Required child"));
    (module.implies ?? []).forEach((imp) => {
      const target = findTarget(
        imp.targetKind,
        id,
        `implies:${id}:${imp.moduleId}`,
        imp.moduleId,
      );
      if (target) visit(target, imp.moduleId, id, "Implied by selection");
    });
  };
  working.targets.forEach(ensureTarget);
  working.picks.forEach((pick) => {
    const owner =
      pick.owner ??
      findTarget(
        pick.kind,
        `intent:${pick.id}`,
        `owner:${pick.id}`,
        pick.moduleId,
        undefined,
        pick.id,
      );
    if (owner) {
      explicit.add(moduleKey(owner, pick.moduleId));
      visit(
        owner,
        pick.moduleId,
        `target:${owner.toKey()}`,
        "Selected explicitly",
      );
      const attached = selected.get(moduleKey(owner, pick.moduleId));
      if (attached) selected.set(attached.id, { ...attached, explicit: true });
    }
  });
  // Explicit child choices attach beneath a selected parent on the same target.
  const nestedLinks = [...links.values()].flatMap((edge) => {
    const child = selected.get(edge.to);
    if (
      !child ||
      edge.from !== `target:${child.owner.toKey()}` ||
      edge.reason !== "Selected explicitly"
    )
      return [edge];
    const parents = [...selected.values()].filter(
      (parent) =>
        parent.owner.toKey() === child.owner.toKey() &&
        parent.module.children?.some(
          (entry) => entry.moduleId === child.module.id,
        ),
    );
    return parents.length
      ? parents.map((parent) => ({
          from: parent.id,
          to: child.id,
          reason: "Optional feature",
        }))
      : [edge];
  });
  const result = [...selected.values()];
  const conflicts = result.flatMap((a, i) =>
    result
      .slice(i + 1)
      .filter(
        (b) =>
          a.owner.toKey() === b.owner.toKey() &&
          ((a.module.conflictsWith ?? []).includes(b.module.id) ||
            (b.module.conflictsWith ?? []).includes(a.module.id)),
      )
      .map((b) => ({
        left: a.id,
        right: b.id,
        message: `${a.module.title} conflicts with ${b.module.title} on ${ownerLabel(a.owner)}.`,
      })),
  );
  return {
    targets: [...usedTargets.values()],
    modules: result,
    links: nestedLinks,
    decisions: [...decisions.values()],
    conflicts,
    issues: [...issues],
  };
};

export const resolveTargetDecision = (
  state: WorkingSelection,
  decision: TargetDecision,
  owner: TargetIdentity,
): WorkingSelection => ({
  ...state,
  targets: uniqueTargets([...state.targets, owner]),
  picks: state.picks.map((p) =>
    p.id === decision.pickId ? { ...p, owner } : p,
  ),
  bindings: { ...state.bindings, [decision.id]: ownerLabel(owner) },
});
export const chooseProvider = (
  state: WorkingSelection,
  decision: ProviderDecision,
  moduleId: string,
): WorkingSelection => {
  const id = `pick:${moduleId}:${decision.owner.toKey()}`;
  return state.picks.some((p) => p.id === id)
    ? state
    : {
        ...state,
        picks: [
          ...state.picks,
          { id, moduleId, kind: decision.owner.kind, owner: decision.owner },
        ],
      };
};
export const removePick = (
  state: WorkingSelection,
  node: SelectedModule,
): WorkingSelection => ({
  ...state,
  picks: state.picks.filter(
    (p) =>
      !(
        p.moduleId === node.module.id &&
        (p.owner?.toKey() === node.owner.toKey() || !p.owner)
      ),
  ),
});
export const toSelection = (
  projection: SelectionProjection,
): typeof Selection.Type => ({
  targets: projection.targets.map((identity) => ({
    identity,
    modules: projection.modules
      .filter((m) => m.owner.toKey() === identity.toKey())
      .map((m) => ({ id: m.module.id })),
  })),
});
export const conflictFor = (
  model: CatalogModel,
  state: WorkingSelection,
  moduleId: string,
  kind?: string,
) => {
  const added = addPick(model, state, moduleId, kind);
  return projectSelection(model, added).conflicts.map((c) => c.message);
};
export const suggestedTarget = (
  model: CatalogModel,
  decision: TargetDecision,
): TargetIdentity => {
  const module = model.modules.find((m) => m.id === decision.moduleId);
  const exactRule = module?.supportedOn.find(
    (rule) => rule._tag === "identity" && rule.identity.kind === decision.kind,
  );
  return (
    decision.exact ??
    (exactRule?._tag === "identity"
      ? exactRule.identity
      : newIdentity(
          decision.kind,
          model.targets.find((t) => t.kind === decision.kind)?.defaultName ??
            (decision.kind === "workspace" ? "my-effect-app" : ""),
        ))
  );
};
