import { ModuleId } from "@repo/domain/Catalog";
import {
  CatalogSources,
  defaultCatalogSources,
  formatCatalogSource,
} from "@repo/domain/CatalogSource";
import { encodeRecipeTargetSpecs, RecipeTargetString } from "@repo/scaffold";
import { toWorkspaceToolValue } from "@repo/scaffold/browser";
import { Option, Schema } from "effect";
import {
  emptySelection,
  newIdentity,
  type WorkingSelection,
  type SelectionProjection,
  type Pick,
} from "./selection";
import { organicVariants, type OrganicVariant } from "./variants";
export type Direction = OrganicVariant;
const Pending = Schema.fromJsonString(
  Schema.Tuple([Schema.String, Schema.String]),
);
const Binding = Schema.fromJsonString(
  Schema.Tuple([Schema.String, Schema.String]),
);
export const decodeExplorerUrl = (params: URLSearchParams) => {
  const decoded = params
    .getAll("target")
    .map((value) => Schema.decodeOption(RecipeTargetString)(value));
  const pending = params
    .getAll("pending")
    .map((value) => Schema.decodeOption(Pending)(value));
  const bindings = params
    .getAll("bind")
    .map((value) => Schema.decodeOption(Binding)(value));
  const rawSources = params.getAll("catalog").map((value) => {
    const i = value.indexOf("=");
    return i < 0
      ? { name: value }
      : { name: value.slice(0, i), url: value.slice(i + 1) };
  });
  const sources = Schema.decodeUnknownOption(CatalogSources)(
    rawSources.length ? rawSources : defaultCatalogSources,
  );
  const invalid =
    decoded.some(Option.isNone) ||
    pending.some(Option.isNone) ||
    bindings.some(Option.isNone) ||
    Option.isNone(sources);
  const targets = decoded.flatMap((v) => (Option.isSome(v) ? [v.value] : []));
  const picks: Pick[] = targets.flatMap(({ target, modules }) =>
    modules.map((moduleId) => ({
      id: `pick:${moduleId}:${target.toKey()}`,
      moduleId,
      kind: target.kind,
      owner: target,
    })),
  );
  return {
    direction:
      organicVariants.find((variant) => variant.id === params.get("view"))
        ?.id ?? "bands",
    sources: Option.getOrElse(sources, () => defaultCatalogSources),
    issue: invalid
      ? "This explorer link contains invalid selection or catalog parameters. Reset the link before continuing."
      : undefined,
    state: invalid
      ? emptySelection
      : ({
          targets: targets.map((t) => t.target),
          picks: [
            ...picks,
            ...pending.flatMap((v) =>
              Option.isSome(v)
                ? [
                    {
                      id: `pick:${v.value[1]}:${v.value[0]}`,
                      kind: v.value[0],
                      moduleId: v.value[1],
                    },
                  ]
                : [],
            ),
          ],
          bindings: Object.fromEntries(
            bindings.flatMap((v) => (Option.isSome(v) ? [v.value] : [])),
          ),
        } satisfies WorkingSelection),
  };
};
export const encodeExplorerUrl = (
  state: WorkingSelection,
  sources: CatalogSources,
  direction: Direction,
) => {
  const params = new URLSearchParams({ view: direction });
  sources.forEach((s) => params.append("catalog", formatCatalogSource(s)));
  encodeRecipeTargetSpecs(
    state.targets.map((target) => ({
      target,
      modules: state.picks
        .filter((p) => p.owner?.toKey() === target.toKey())
        .map((p) => ModuleId.make(p.moduleId)),
    })),
  ).forEach((target) => params.append("target", target));
  state.picks
    .filter((p) => !p.owner)
    .forEach((p) =>
      params.append(
        "pending",
        Schema.encodeSync(Pending)([p.kind, p.moduleId]),
      ),
    );
  Object.entries(state.bindings).forEach((binding) =>
    params.append("bind", Schema.encodeSync(Binding)(binding)),
  );
  return params;
};
export const builderUrl = (
  projection: SelectionProjection,
  sources: CatalogSources,
) => {
  const params = new URLSearchParams({
    name: "my-effect-app",
    monorepo: "",
    lint: "",
    format: "",
    test: "",
  });
  (["monorepo", "lint", "format", "test"] as const).forEach((field) => {
    const choice = projection.modules.find(
      (m) =>
        m.owner.kind === "workspace" &&
        (m.module.categories ?? []).some((category) => category === field),
    );
    params.set(field, choice ? toWorkspaceToolValue(choice.module.id) : "");
  });
  const hasGit = projection.modules.some(
    (m) => m.module.id === "workspace-devenv-git",
  );
  if (!hasGit) params.set("no-git", "");
  if (projection.modules.some((m) => m.module.id === "workspace-typescript-6"))
    params.set("typescript", "6");
  sources.forEach((s) => params.append("catalog", formatCatalogSource(s)));
  encodeRecipeTargetSpecs(
    projection.targets.map((owner) => ({
      target:
        owner.kind === "workspace"
          ? newIdentity("workspace", "my-effect-app")
          : owner,
      modules: projection.modules
        .filter((m) => m.owner.toKey() === owner.toKey())
        .map((m) => m.module.id),
    })),
  ).forEach((target) => params.append("target", target));
  return `/builder?${params}`;
};
