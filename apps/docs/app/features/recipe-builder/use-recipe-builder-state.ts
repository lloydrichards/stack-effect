"use client";

import { useAtom } from "@effect/atom-react";
import { useStore } from "@tanstack/react-form";
import { batch } from "@tanstack/store";
import { Cause, Result } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useEffect, useRef, useState } from "react";
import {
  type CatalogRequestSource,
  catalogAtom,
  previewAtom,
} from "../../atom/worker-atom";
import { recipePreviewClientErrorMessage } from "../../worker/recipe-preview-client";
import type {
  BuilderCatalogOutputWire,
  BuilderCatalogRequestWire,
  RecipePreviewOutputWire,
} from "../../worker/recipe-preview-protocol";
import {
  dependencySourceNames,
  ownerKey,
  removeTargetAndDependencies,
  targetKey,
  targetNameError,
  toggleSupportSelection,
  toggleTargetModule,
  uniqueOwners,
} from "./builder-state";
import {
  type CatalogModule,
  type SupportConfiguration,
  toRecipePreviewInput,
  useRecipeBuilderForm,
} from "./recipe-builder-form";

export type PreviewState =
  | "starting"
  | "loading"
  | "ready"
  | "invalid"
  | "error";

export type CatalogState = "loading" | "ready" | "error";

export const newTargetTabId = "new-target";

export function useRecipeBuilderState() {
  const form = useRecipeBuilderForm();
  const values = useStore(form.store, (state) => state.values);
  const formValid = useStore(form.store, (state) => state.isValid);
  const [catalogResult, requestCatalog] = useAtom(catalogAtom);
  const [previewResult, requestPreview] = useAtom(previewAtom);
  const {
    config,
    developerExperienceModules,
    gitEnabled,
    supportSelections,
    targets,
  } = values;
  const [activeId, setActiveId] = useState(newTargetTabId);
  const [catalog, setCatalog] = useState<BuilderCatalogOutputWire>();
  const [catalogState, setCatalogState] = useState<CatalogState>("loading");
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [preview, setPreview] = useState<RecipePreviewOutputWire>();
  const [previewState, setPreviewState] = useState<PreviewState>("starting");
  const [previewError, setPreviewError] = useState<string>();
  const [compatibilityNotice, setCompatibilityNotice] = useState<string>();
  const catalogGenerationRef = useRef(0);
  const handledCatalogGenerationRef = useRef(0);
  const previewGenerationRef = useRef(0);
  const handledPreviewGenerationRef = useRef(0);
  const resolvedCatalogOwnersRef = useRef("");
  const retryCatalogOwnersRef = useRef<
    | {
        readonly targetIdentityKey: string;
        readonly owners: BuilderCatalogRequestWire["owners"];
        readonly source: CatalogRequestSource;
      }
    | undefined
  >(undefined);
  const nextTargetRef = useRef(0);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const activeTarget = targets.find((target) => target.id === activeId);
  const configurationValid =
    catalog === undefined ||
    (["monorepo", "lint", "format", "test"] as const).every(
      (field) =>
        config[field] === undefined ||
        catalog.configuration[field].some(
          (choice) => choice.value === config[field],
        ),
    );
  const canPreview =
    formValid &&
    configurationValid &&
    targets.every(
      (target) =>
        targetNameError(target, targets) === undefined &&
        target.modules.length > 0,
    );
  const targetIdentityKey = targets.map(targetKey).join("\u0000");
  const activeModules =
    catalog?.targetModules.find(
      (entry) =>
        activeTarget && ownerKey(entry.owner) === targetKey(activeTarget),
    )?.modules ?? [];

  useEffect(() => {
    setCatalogState((state) => (state === "ready" ? state : "loading"));
    const generation = ++catalogGenerationRef.current;
    const identityOwners = targets.map(({ kind, name }) => ({ kind, name }));
    const retry = retryCatalogOwnersRef.current;
    const matchingRetry =
      retry?.targetIdentityKey === targetIdentityKey ? retry : undefined;
    const owners = matchingRetry?.owners ?? identityOwners;
    if (retry !== undefined && retry.targetIdentityKey !== targetIdentityKey) {
      retryCatalogOwnersRef.current = undefined;
    }
    requestCatalog({
      generation,
      targetIdentityKey,
      owners,
      source: matchingRetry?.source ?? "identity",
    });
    // Module selection deliberately does not invalidate catalog metadata.
    // biome-ignore lint/correctness/useExhaustiveDependencies: targetIdentityKey captures the identity fields used by this effect.
  }, [catalogRevision, requestCatalog, targetIdentityKey]);

  useEffect(() => {
    if (AsyncResult.isFailure(catalogResult)) {
      if (Cause.hasInterrupts(catalogResult.cause)) return;
      setCatalogState("error");
      setPreviewState("error");
      setPreviewError("The preview worker stopped unexpectedly.");
      return;
    }
    if (!AsyncResult.isSuccess(catalogResult)) return;

    const { request, result } = catalogResult.value;
    if (
      request.generation !== catalogGenerationRef.current ||
      request.generation === handledCatalogGenerationRef.current
    )
      return;
    handledCatalogGenerationRef.current = request.generation;

    Result.match(result, {
      onFailure: (error) => {
        retryCatalogOwnersRef.current = {
          targetIdentityKey: request.targetIdentityKey,
          owners: request.owners,
          source: request.source,
        };
        setCatalogState("error");
        if (request.source === "identity") setPreviewState("error");
        setPreviewError(recipePreviewClientErrorMessage(error));
      },
      onSuccess: (nextCatalog) => {
        resolvedCatalogOwnersRef.current = request.owners
          .map(ownerKey)
          .join("\u0000");
        retryCatalogOwnersRef.current = undefined;
        setCatalog(nextCatalog);
        setCatalogState("ready");
        if (request.source !== "identity") return;

        const removedModules = targets.flatMap((target) => {
          const supported = new Set(
            nextCatalog.targetModules
              .find((entry) => ownerKey(entry.owner) === targetKey(target))
              ?.modules.map((module) => module.id) ?? [],
          );
          return target.modules.filter((module) => !supported.has(module));
        });
        if (removedModules.length > 0) {
          setCompatibilityNotice(
            `Removed modules that do not support the renamed target: ${removedModules.join(", ")}.`,
          );
        }
        form.setFieldValue("targets", (current) => {
          const next = current.map((target) => {
            const modules = nextCatalog.targetModules.find(
              (entry) => ownerKey(entry.owner) === targetKey(target),
            )?.modules;
            if (modules === undefined) return target;
            const supported = new Set(modules.map((module) => module.id));
            const filteredModules = target.modules.filter((module) =>
              supported.has(module),
            );
            return filteredModules.length === target.modules.length &&
              filteredModules.every(
                (module, index) => module === target.modules[index],
              )
              ? target
              : { ...target, modules: filteredModules };
          });
          return next.every((target, index) => target === current[index])
            ? current
            : next;
        });
      },
    });
  }, [catalogResult, form, targets]);

  useEffect(() => {
    if (!canPreview) {
      requestPreview(Atom.Interrupt);
      setPreviewState("invalid");
      return;
    }

    const generation = ++previewGenerationRef.current;
    setPreviewState("loading");
    requestPreview({ generation, input: toRecipePreviewInput(values) });
  }, [canPreview, requestPreview, values]);

  useEffect(() => {
    if (AsyncResult.isFailure(previewResult)) {
      if (Cause.hasInterrupts(previewResult.cause)) return;
      setPreviewState("error");
      setPreviewError("The preview worker stopped unexpectedly.");
      return;
    }
    if (!AsyncResult.isSuccess(previewResult)) return;

    const { request, result } = previewResult.value;
    if (
      request.generation !== previewGenerationRef.current ||
      request.generation === handledPreviewGenerationRef.current
    )
      return;
    handledPreviewGenerationRef.current = request.generation;

    Result.match(result, {
      onFailure: (error) => {
        setPreviewState("error");
        setPreviewError(recipePreviewClientErrorMessage(error));
      },
      onSuccess: (nextPreview) => {
        setPreview(nextPreview);
        setPreviewState("ready");
        setPreviewError(undefined);
        const resolvedOwners = nextPreview.blueprint.nodes.flatMap((node) =>
          node._tag === "target" ? [node.identity] : [],
        );
        const owners = uniqueOwners([...targets, ...resolvedOwners]);
        const ownersKey = owners.map(ownerKey).join("\u0000");
        if (ownersKey === resolvedCatalogOwnersRef.current) return;
        requestCatalog({
          generation: ++catalogGenerationRef.current,
          targetIdentityKey,
          owners,
          source: "preview",
        });
      },
    });
  }, [previewResult, requestCatalog, targetIdentityKey, targets]);

  const toggleModule = (module: CatalogModule) => {
    if (activeTarget === undefined || catalog === undefined) return;
    const selected = activeTarget.modules.includes(module.id);
    batch(() => {
      form.setFieldValue("supportSelections", (current) =>
        selected ? [] : current,
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
    module: CatalogModule,
  ) =>
    form.setFieldValue("supportSelections", (current) =>
      toggleSupportSelection(current, configuration, module),
    );

  const addTarget = (kind: string) => {
    const definition = catalog?.targets.find((target) => target.kind === kind);
    if (definition === undefined) return;
    const sameKindCount = targets.filter(
      (target) => target.kind === kind,
    ).length;
    const baseName = definition.defaultName ?? kind;
    const name =
      sameKindCount === 0 ? baseName : `${baseName}-${sameKindCount + 1}`;
    const id = `${kind}-${++nextTargetRef.current}`;
    form.setFieldValue("targets", (current) => [
      ...current,
      { id, kind, name, modules: [] },
    ]);
    setActiveId(id);
  };

  const removeTarget = (id: string) => {
    const index = targets.findIndex((target) => target.id === id);
    const remaining = removeTargetAndDependencies(targets, id);
    const focusId = remaining[Math.min(index, remaining.length - 1)]?.id;
    batch(() => {
      form.setFieldValue("targets", remaining);
      form.setFieldValue("supportSelections", []);
    });
    if (id === activeId) setActiveId(focusId ?? "");
    if (remaining.length === 0) {
      setActiveId(newTargetTabId);
    }
    window.requestAnimationFrame(() =>
      tabRefs.current.get(focusId ?? "")?.focus(),
    );
  };

  return {
    state: {
      activeId,
      activeModules,
      activeTarget,
      availableTargets:
        catalog?.targets.filter((target) => target.kind !== "workspace") ?? [],
      catalog,
      catalogState,
      config,
      configurationChoices: catalog?.configuration,
      compatibilityNotice,
      developerExperienceModules,
      dependencySourceNames: activeTarget
        ? dependencySourceNames(activeTarget, targets)
        : [],
      gitEnabled,
      newTargetOpen: activeId === newTargetTabId,
      preview,
      previewError,
      previewState,
      requiredModuleIds: new Set(
        activeTarget?.requirements?.map(
          (requirement) => requirement.moduleId,
        ) ?? [],
      ),
      supportSelections,
      targets,
      form,
    },
    actions: {
      addTarget,
      openTargetSelector: () => setActiveId(newTargetTabId),
      registerTargetTab: (id: string, element: HTMLButtonElement | null) => {
        if (element) tabRefs.current.set(id, element);
        else tabRefs.current.delete(id);
      },
      removeTarget,
      retryCatalog: () => setCatalogRevision((revision) => revision + 1),
      selectTarget: setActiveId,
      toggleModule,
      toggleSupportModule,
    },
  };
}
