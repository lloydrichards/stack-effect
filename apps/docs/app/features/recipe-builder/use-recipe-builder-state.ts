"use client";

import { useAtom } from "@effect/atom-react";
import { TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import type { RecipePreview } from "@repo/scaffold/recipe-preview";
import { useStore } from "@tanstack/react-form";
import { batch } from "@tanstack/store";
import { Cause } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useEffect, useRef, useState } from "react";
import { trackEvent } from "~/lib/analytics";
import {
  dependencySourceNames,
  makeTargetInstance,
  ownerKey,
  removeModuleSupportSelections,
  removeTargetAndDependencies,
  removeTargetSupportSelections,
  targetKey,
  targetNameError,
  toggleSupportSelection,
  toggleTargetModule,
  uniqueOwners,
} from "./builder-state";
import {
  type SupportConfiguration,
  toRecipePreviewInput,
  useRecipeBuilderForm,
} from "./recipe-builder-form";
import {
  type CatalogAtomRequest,
  type CatalogRequestSource,
  catalogAtom,
  previewAtom,
  recipeBuilderRpcErrorMessage,
} from "./worker/client";
import { CatalogModule, RecipeBuilderCatalog } from "./worker/domain";

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
  const [catalog, setCatalog] = useState<typeof RecipeBuilderCatalog.Type>();
  const [catalogState, setCatalogState] = useState<CatalogState>("loading");
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [preview, setPreview] = useState<RecipePreview>();
  const [previewState, setPreviewState] = useState<PreviewState>("starting");
  const [previewError, setPreviewError] = useState<string>();
  const [compatibilityNotice, setCompatibilityNotice] = useState<string>();
  const handledCatalogResultRef = useRef<unknown>(undefined);
  const handledPreviewResultRef = useRef<unknown>(undefined);
  const pendingCatalogRequestRef = useRef<CatalogAtomRequest | undefined>(
    undefined,
  );
  const resolvedCatalogOwnersRef = useRef("");
  const retryCatalogOwnersRef = useRef<
    | {
        readonly targetIdentityKey: string;
        readonly owners: ReadonlyArray<TargetIdentity>;
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
    targets.every((target) => targetNameError(target, targets) === undefined);
  const targetIdentityKey = targets.map(targetKey).join("\u0000");
  const activeModules =
    catalog?.targetModules.find(
      (entry) =>
        activeTarget && ownerKey(entry.owner) === targetKey(activeTarget),
    )?.modules ?? [];

  useEffect(() => {
    setCatalogState((state) => (state === "ready" ? state : "loading"));
    const identityOwners = targets.map(
      ({ kind, name }) =>
        new TargetIdentity({ kind: TargetKind.make(kind), name }),
    );
    const retry = retryCatalogOwnersRef.current;
    const matchingRetry =
      retry?.targetIdentityKey === targetIdentityKey ? retry : undefined;
    const owners = matchingRetry?.owners ?? identityOwners;
    if (retry !== undefined && retry.targetIdentityKey !== targetIdentityKey) {
      retryCatalogOwnersRef.current = undefined;
    }
    const request = {
      targetIdentityKey,
      owners,
      source: matchingRetry?.source ?? "identity",
    } as const;
    pendingCatalogRequestRef.current = request;
    requestCatalog(request);
    // Module selection deliberately does not invalidate catalog metadata.
    // biome-ignore lint/correctness/useExhaustiveDependencies: targetIdentityKey captures the identity fields used by this effect.
  }, [catalogRevision, requestCatalog, targetIdentityKey]);

  useEffect(() => {
    if (
      catalogResult.waiting ||
      handledCatalogResultRef.current === catalogResult
    )
      return;
    handledCatalogResultRef.current = catalogResult;

    if (AsyncResult.isFailure(catalogResult)) {
      if (Cause.hasInterrupts(catalogResult.cause)) return;
      const request = pendingCatalogRequestRef.current;
      if (request !== undefined) retryCatalogOwnersRef.current = request;
      setCatalogState("error");
      if (request?.source !== "preview") {
        setPreviewState("error");
        setPreviewError(recipeBuilderRpcErrorMessage(catalogResult.cause));
      }
      return;
    }
    if (!AsyncResult.isSuccess(catalogResult)) return;

    const { request, catalog: nextCatalog } = catalogResult.value;
    resolvedCatalogOwnersRef.current = request.owners
      .map(ownerKey)
      .join("\u0000");
    retryCatalogOwnersRef.current = undefined;
    setCatalog(nextCatalog);
    setCatalogState("ready");
    if (request.source !== "identity") return;

    const removedModules = targets.flatMap((target) => {
      const supported = new Set<string>(
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
        const supported = new Set<string>(modules.map((module) => module.id));
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
  }, [catalogResult, form, targets]);

  useEffect(() => {
    if (!canPreview) {
      requestPreview(Atom.Interrupt);
      setPreviewState("invalid");
      return;
    }

    setPreviewState("loading");
    requestPreview({ input: toRecipePreviewInput(values) });
  }, [canPreview, requestPreview, values]);

  useEffect(() => {
    if (
      previewResult.waiting ||
      handledPreviewResultRef.current === previewResult
    )
      return;
    handledPreviewResultRef.current = previewResult;

    if (AsyncResult.isFailure(previewResult)) {
      if (Cause.hasInterrupts(previewResult.cause)) return;
      setPreviewState("error");
      setPreviewError(recipeBuilderRpcErrorMessage(previewResult.cause));
      return;
    }
    if (!AsyncResult.isSuccess(previewResult)) return;

    const nextPreview = previewResult.value;
    setPreview(nextPreview);
    setPreviewState("ready");
    setPreviewError(undefined);
    const resolvedOwners = nextPreview.blueprint.nodes.flatMap((node) =>
      node._tag === "target" ? [node.identity] : [],
    );
    const owners = uniqueOwners([
      ...targets.map(
        ({ kind, name }) =>
          new TargetIdentity({ kind: TargetKind.make(kind), name }),
      ),
      ...resolvedOwners,
    ]);
    const ownersKey = owners.map(ownerKey).join("\u0000");
    if (ownersKey === resolvedCatalogOwnersRef.current) return;
    const request = {
      targetIdentityKey,
      owners,
      source: "preview",
    } as const;
    pendingCatalogRequestRef.current = request;
    requestCatalog(request);
  }, [previewResult, requestCatalog, targetIdentityKey, targets]);

  const toggleModule = (module: typeof CatalogModule.Type) => {
    if (activeTarget === undefined || catalog === undefined) return;
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
    module: typeof CatalogModule.Type,
  ) =>
    form.setFieldValue("supportSelections", (current) =>
      toggleSupportSelection(current, configuration, module),
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
      requiredModuleIds: new Set([
        ...(activeTarget?.requirements?.map(
          (requirement) => requirement.moduleId,
        ) ?? []),
        ...(catalog?.targets.find(
          (target) => target.kind === activeTarget?.kind,
        )?.requiredModules ?? []),
      ]),
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
