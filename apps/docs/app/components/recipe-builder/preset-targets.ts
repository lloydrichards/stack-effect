import { BlueprintNode } from "@repo/domain/Blueprint";
import { useSelector } from "@tanstack/react-form";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import {
  useRecipeBuilderCatalog,
  useRecipeBuilderFormContext,
  useRecipeBuilderPreview,
} from "./recipe-builder-context";

export function usePresetTargets() {
  const form = useRecipeBuilderFormContext();
  const selected = useSelector(
    form.store,
    (state) => state.values.developerExperienceModules,
  );
  const { catalog } = useRecipeBuilderCatalog();
  const { previewResult } = useRecipeBuilderPreview();
  const blueprint = Option.getOrUndefined(
    AsyncResult.value(previewResult),
  )?.blueprint;
  if (!blueprint) return [];

  return (catalog?.configuration.presets ?? [])
    .filter((preset) => selected.includes(preset.value))
    .map((preset) => {
      const pending = [`.#${preset.value}`];
      const included = new Set<string>();
      for (const id of pending) {
        if (included.has(id)) continue;
        included.add(id);
        for (const edge of blueprint.edges) {
          if (edge.from === id && edge.reason !== "owns-module") {
            pending.push(edge.to);
          }
        }
      }

      const modules = blueprint.nodes
        .filter(BlueprintNode.guards["attached-module"])
        .filter(
          ({ id, moduleId }) => included.has(id) && moduleId !== preset.value,
        );
      const targets = blueprint.nodes.flatMap((node) => {
        if (node._tag !== "target") return [];
        const attached = modules.filter(
          (module) => module.targetId === node.id,
        );
        if (attached.length === 0 && !included.has(node.id)) return [];

        const options = catalog?.targetModules.find(
          ({ owner }) => owner.toKey() === node.id,
        )?.modules;
        return [
          {
            id: node.id,
            identity: node.identity,
            modules: attached.map(({ moduleId }) => ({
              id: moduleId,
              title:
                options?.find(({ id }) => id === moduleId)?.title ?? moduleId,
            })),
          },
        ];
      });
      return { preset, targets };
    });
}
