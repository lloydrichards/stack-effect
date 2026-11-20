import { useSelector } from "@tanstack/react-form";
import { batch } from "@tanstack/store";
import { useRef, useState } from "react";
import { trackEvent } from "~/lib/analytics";
import { CatalogModule } from "../../../workers/recipe-builder/domain";
import { ownerKey, type SupportConfiguration } from "../form";
import { usePresetTargets } from "../preset-targets";
import {
  useRecipeBuilderCatalog,
  useRecipeBuilderFormContext,
} from "../recipe-builder-context";
import {
  makeTargetInstance,
  removeModuleSupportSelections,
  removeTargetAndDependencies,
  removeTargetSupportSelections,
  toggleSupportSelection,
  toggleTargetModule,
} from "./state";

export function useTargetEditor() {
  const form = useRecipeBuilderFormContext();
  const { catalog, catalogFailed, catalogOwnersByTargetId } =
    useRecipeBuilderCatalog();
  const explicitTargets = useSelector(
    form.store,
    (state) => state.values.targets,
  );
  const included = usePresetTargets().flatMap(({ preset, targets }) =>
    targets
      .filter(({ identity }) => identity.kind !== "workspace")
      .map(({ identity }) => ({ identity, preset: preset.title })),
  );
  const presetNames = new Map(
    included.map(({ identity, preset }) => [ownerKey(identity), preset]),
  );
  const targets = [...explicitTargets];
  for (const { identity } of included) {
    if (targets.some((target) => ownerKey(target) === ownerKey(identity)))
      continue;
    targets.push({
      id: `preset:${ownerKey(identity)}`,
      kind: identity.kind,
      name: identity.name,
      modules: [],
    });
  }
  const supportSelections = useSelector(
    form.store,
    (state) => state.values.supportSelections,
  );
  const [activeId, setActiveId] = useState<string>();
  const nextTargetRef = useRef(0);
  const nextId = () => {
    do {
      nextTargetRef.current += 1;
    } while (
      targets.some((target) => target.id.endsWith(`-${nextTargetRef.current}`))
    );
    return nextTargetRef.current;
  };
  const targetButtons = useRef(new Map<string, HTMLButtonElement>());
  const activeTarget = targets.find((target) => target.id === activeId);

  const activeTargetIndex = explicitTargets.findIndex(
    (target) => target.id === activeId,
  );

  const toggleModule = (module: typeof CatalogModule.Type) => {
    if (activeTarget === undefined || catalog === undefined) return;
    const activeModules =
      catalog.targetModules.find(
        (entry) =>
          ownerKey(entry.owner) ===
          ownerKey(
            catalogOwnersByTargetId.get(activeTarget.id) ?? activeTarget,
          ),
      )?.modules ?? [];
    const selected = activeTarget.modules.includes(module.id);
    batch(() => {
      form.setFieldValue("supportSelections", (current) =>
        selected
          ? removeModuleSupportSelections(
              current,
              activeTarget,
              module,
              activeModules,
            )
          : current,
      );
      form.setFieldValue("targets", (current) =>
        toggleTargetModule(
          current.some((target) => target.id === activeTarget.id)
            ? current
            : [...current, activeTarget],
          activeTarget,
          module,
          activeModules,
          catalog,
          nextId,
        ),
      );
    });
  };

  const toggleSupportModule = (
    configuration: SupportConfiguration,
    moduleId: string,
  ) =>
    form.setFieldValue("supportSelections", (current) =>
      toggleSupportSelection(current, configuration, moduleId),
    );

  const addTarget = (kind: string) => {
    const definition = catalog?.targets.find((target) => target.kind === kind);
    if (definition === undefined) return;
    const id = `${kind}-${nextId()}`;
    form.setFieldValue("targets", (current) => [
      ...current,
      makeTargetInstance(id, definition, targets),
    ]);
    trackEvent("recipe-target-added", {
      target_kind: kind,
      target_count: targets.length + 1,
      first_target: targets.length === 0,
    });
  };

  const removeTarget = (id: string) => {
    const index = explicitTargets.findIndex((target) => target.id === id);
    const remaining = removeTargetAndDependencies(explicitTargets, id);
    const removed = explicitTargets.filter(
      (target) => !remaining.some((candidate) => candidate.id === target.id),
    );
    const focusId = remaining[Math.min(index, remaining.length - 1)]?.id;
    batch(() => {
      form.setFieldValue("targets", remaining);
      form.setFieldValue("supportSelections", (current) =>
        removeTargetSupportSelections(current, removed),
      );
    });
    if (id === activeId) setActiveId(focusId);
    window.requestAnimationFrame(() =>
      targetButtons.current.get(focusId ?? "")?.focus(),
    );
  };

  return {
    activeTarget,
    activeTargetIndex,
    presetNames,
    addTarget,
    catalog,
    catalogFailed,
    catalogOwnersByTargetId,
    registerTargetButton: (id: string, element: HTMLButtonElement | null) => {
      if (element) targetButtons.current.set(id, element);
      else targetButtons.current.delete(id);
    },
    removeTarget,
    selectTarget: setActiveId,
    supportSelections,
    targets,
    toggleModule,
    toggleSupportModule,
  };
}
