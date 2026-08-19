import { useSelector } from "@tanstack/react-form";
import { batch } from "@tanstack/store";
import { useRef, useState } from "react";
import { trackEvent } from "~/lib/analytics";
import { CatalogModule } from "../../../workers/recipe-builder/domain";
import { ownerKey, type SupportConfiguration } from "../form";
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

export const newTargetTabId = "new-target";

export function useTargetEditor() {
  const form = useRecipeBuilderFormContext();
  const { catalog, catalogFailed, catalogOwnersByTargetId } =
    useRecipeBuilderCatalog();
  const targets = useSelector(form.store, (state) => state.values.targets);
  const supportSelections = useSelector(
    form.store,
    (state) => state.values.supportSelections,
  );
  const [activeId, setActiveId] = useState(newTargetTabId);
  const nextTargetRef = useRef(0);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const activeTarget = targets.find((target) => target.id === activeId);

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
          current,
          activeTarget,
          module,
          activeModules,
          catalog,
          () => ++nextTargetRef.current,
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
    const id = `${kind}-${++nextTargetRef.current}`;
    form.setFieldValue("targets", (current) => [
      ...current,
      makeTargetInstance(id, definition, current),
    ]);
    setActiveId(id);
    trackEvent("recipe-target-added", {
      target_kind: kind,
      target_count: targets.length + 1,
      first_target: targets.length === 0,
    });
  };

  const removeTarget = (id: string) => {
    const index = targets.findIndex((target) => target.id === id);
    const remaining = removeTargetAndDependencies(targets, id);
    const removed = targets.filter(
      (target) => !remaining.some((candidate) => candidate.id === target.id),
    );
    const focusId = remaining[Math.min(index, remaining.length - 1)]?.id;
    batch(() => {
      form.setFieldValue("targets", remaining);
      form.setFieldValue("supportSelections", (current) =>
        removeTargetSupportSelections(current, removed),
      );
    });
    if (id === activeId) setActiveId(focusId ?? newTargetTabId);
    window.requestAnimationFrame(() =>
      tabRefs.current.get(focusId ?? "")?.focus(),
    );
  };

  return {
    activeId,
    activeTarget,
    addTarget,
    catalog,
    catalogFailed,
    catalogOwnersByTargetId,
    registerTargetTab: (id: string, element: HTMLButtonElement | null) => {
      if (element) tabRefs.current.set(id, element);
      else tabRefs.current.delete(id);
    },
    removeTarget,
    selectTarget: setActiveId,
    supportSelections,
    targets,
    toggleModule,
    toggleSupportModule,
  };
}
