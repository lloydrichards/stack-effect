import { BlueprintNode } from "@repo/domain/Blueprint";
import type { TargetIdentity } from "@repo/domain/Catalog";
import { useSelector } from "@tanstack/react-form";
import { batch } from "@tanstack/store";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useRef, useState } from "react";
import { trackEvent } from "~/lib/analytics";
import { CatalogModule } from "../../../workers/recipe-builder/domain";
import { ownerKey, type SupportConfiguration } from "../form";
import { usePresetTargets } from "../preset-targets";
import {
  useRecipeBuilderCatalog,
  useRecipeBuilderFormContext,
  useRecipeBuilderPreview,
} from "../recipe-builder-context";
import {
  makeTargetInstance,
  removeModuleSupportSelections,
  removeTargetAndDependencies,
  removeTargetSupportSelections,
  toggleSupportSelection,
  toggleTargetModule,
} from "./state";

const resolvedOwnerKey = (identity: TargetIdentity) =>
  ownerKey(
    identity.placement === "default"
      ? { kind: identity.kind, name: "" }
      : identity,
  );

export const useTargetEditor = () => {
  const form = useRecipeBuilderFormContext();
  const { catalog, catalogFailed, catalogOwnersByTargetId } =
    useRecipeBuilderCatalog();
  const explicitTargets = useSelector(
    form.store,
    (state) => state.values.targets,
  );
  const { previewResult } = useRecipeBuilderPreview();
  const blueprint = Option.getOrUndefined(
    AsyncResult.value(previewResult),
  )?.blueprint;
  const presetNames = new Map(
    usePresetTargets().flatMap(({ preset, targets }) =>
      targets.map(({ identity }) => [ownerKey(identity), preset.title]),
    ),
  );
  const requiredModuleNodes = new Set(
    blueprint?.edges
      .filter(({ reason }) => reason === "required-module")
      .map(({ to }) => to),
  );
  const resolvedTargets =
    blueprint?.nodes.filter(BlueprintNode.guards.target) ?? [];
  const requiredModulesByTarget = new Map<string, string[]>();
  for (const node of blueprint?.nodes ?? []) {
    if (node._tag !== "attached-module" || !requiredModuleNodes.has(node.id))
      continue;
    const modules = requiredModulesByTarget.get(node.targetId) ?? [];
    modules.push(node.moduleId);
    requiredModulesByTarget.set(node.targetId, modules);
  }

  const targets = [...explicitTargets];
  const explicitOwners = new Set(explicitTargets.map(ownerKey));
  for (const { id, identity } of resolvedTargets) {
    if (
      identity.kind === "workspace" ||
      explicitOwners.has(resolvedOwnerKey(identity))
    )
      continue;
    targets.push({
      id: `resolved:${id}`,
      kind: identity.kind,
      name: identity.placement === "default" ? "" : identity.name,
      modules: [],
      addedByDependency: true,
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

  const resolvedActiveTarget = resolvedTargets.find(
    ({ id, identity }) =>
      activeTarget &&
      (activeTarget.id === `resolved:${id}` ||
        resolvedOwnerKey(identity) === ownerKey(activeTarget)),
  );

  const toggleModule = (module: CatalogModule) => {
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
    const defaultName = catalog.targets.find(
      ({ kind }) => kind === activeTarget.kind,
    )?.defaultName;
    const preservesDefault =
      resolvedActiveTarget?.identity.placement === "implicit" &&
      activeTarget.name === defaultName;

    const target =
      activeTargetIndex >= 0
        ? activeTarget
        : {
            ...activeTarget,
            id: `${activeTarget.kind}-${nextId()}`,
            name: preservesDefault ? "" : activeTarget.name,
            addedByDependency: undefined,
          };
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
          target === activeTarget ? current : [...current, target],
          target,
          module,
          activeModules,
          catalog,
          nextId,
        ),
      );
    });
    if (target !== activeTarget) setActiveId(target.id);
  };

  const toggleSupportModule = (
    configuration: SupportConfiguration,
    moduleId: string,
  ) =>
    form.setFieldValue("supportSelections", (current) =>
      toggleSupportSelection(current, configuration, moduleId),
    );

  const addTarget = (kind: string) => {
    const definitions = catalog?.targets ?? [];
    const definition = definitions.find((target) => target.kind === kind);
    if (definition === undefined) return;
    const id = `${kind}-${nextId()}`;
    form.setFieldValue("targets", (current) => [
      ...current,
      makeTargetInstance(id, definition, targets, definitions),
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
    activeRequiredModules: resolvedActiveTarget
      ? requiredModulesByTarget.get(resolvedActiveTarget.id)
      : undefined,
    activeTarget,
    activeTargetPath: resolvedActiveTarget?.identity.toPath(),
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
};
