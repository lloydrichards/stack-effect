"use client";

import { Option } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { useRef } from "react";
import { DisclosurePanel } from "~/components/molecules/disclosure-panel";
import { ownerKey, toRecipePreviewInput } from "./form";
import {
  useRecipeBuilderCatalog,
  useRecipeBuilderFormContext,
  useRecipeBuilderPreview,
} from "./recipe-builder-context";

export function ResolutionPreview() {
  const form = useRecipeBuilderFormContext();
  const { catalog, catalogOwnersByTargetId } = useRecipeBuilderCatalog();
  const { previewResult } = useRecipeBuilderPreview();
  const preview = Option.getOrUndefined(AsyncResult.value(previewResult));
  if (!preview) return null;

  const values = form.store.state.values;
  const lastRecipe = useRef(previewRecipe(values));
  const recipe = previewRecipe(values) ?? lastRecipe.current;
  if (recipe) lastRecipe.current = recipe;
  const explicit = values.targets.flatMap((target) => {
    const impliedIds = new Set(
      target.requirements
        ?.filter(({ addedModule }) => addedModule)
        .map(({ moduleId }) => moduleId),
    );
    return target.modules
      .filter((moduleId) => !impliedIds.has(moduleId))
      .map((moduleId) => `selected ${target.kind}/${target.name}:${moduleId}`);
  });
  const implications = values.targets.flatMap((source) => {
    const owner = catalogOwnersByTargetId.get(source.id) ?? source;
    const modules = catalog?.targetModules.find(
      (entry) => ownerKey(entry.owner) === ownerKey(owner),
    )?.modules;
    return source.modules.flatMap((moduleId) => {
      const module = modules?.find(({ id }) => id === moduleId);
      return (
        module?.implies.map((implication) => {
          const target = implication.target ?? {
            kind: implication.targetKind,
            name:
              values.targets.find(({ kind }) => kind === implication.targetKind)
                ?.name ?? "",
          };
          return `implied ${target.kind}/${target.name}:${implication.moduleId}; source ${source.kind}/${source.name}:${module.id}; ${implication.reason ?? "Required by the selected module."}`;
        }) ?? []
      );
    });
  });
  const required = preview.blueprint.edges
    .filter(
      ({ reason }) =>
        reason === "required-module" || reason === "required-target",
    )
    .map(({ to, from, reason }) => `required ${to}; source ${from}; ${reason}`);
  const targetNodes = preview.blueprint.nodes.filter(
    (node) => node._tag === "target",
  );
  const config =
    preview.files.find(({ path }) => path === "stack.effect.json")?.contents ??
    "Not generated";

  return (
    <DisclosurePanel
      title="Resolution preview"
      description="Live, non-mutating resolution from the same worker path used to generate the command and files."
      defaultOpen
    >
      <div className="grid gap-5 p-4 text-sm md:p-5">
        <Facet
          title="Normalized Recipe and Selection"
          value={{ recipe, selection: preview.selection }}
        />
        <Facet
          title="Selected, implied, and required provenance"
          value={[...explicit, ...implications, ...required]}
        />
        <Facet
          title="Blueprint"
          value={targetNodes.map((node) => ({
            identity: node.identity,
            architecture: node.architecture,
            context: node.context,
            path: node.layout?.path,
            packageName: node.layout?.packageName,
          }))}
        />
        <Facet
          title="Dependency and implication graph"
          value={{ dependencies: preview.blueprint.edges, implications }}
        />
        <Facet
          title="Package graph"
          value={targetNodes.map((node) => ({
            identity: node.identity,
            packageName: node.layout?.packageName,
            path: node.layout?.path,
          }))}
        />
        <Facet
          title="Prospective files"
          value={preview.files.map(({ path, status }) => ({ path, status }))}
        />
        <Facet title="Command" value={preview.command} />
        <Facet title="Prospective stack config" value={config} />
      </div>
    </DisclosurePanel>
  );
}

function previewRecipe(
  values: Parameters<typeof toRecipePreviewInput>[0],
): ReturnType<typeof toRecipePreviewInput>["recipe"] | undefined {
  try {
    return toRecipePreviewInput(values).recipe;
  } catch {
    return undefined;
  }
}

function Facet({
  title,
  value,
}: {
  readonly title: string;
  readonly value: unknown;
}) {
  return (
    <section>
      <h3 className="font-heading font-semibold">{title}</h3>
      <pre className="mt-2 overflow-auto rounded-md border bg-muted/20 p-3 text-xs/5 whitespace-pre-wrap">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}
