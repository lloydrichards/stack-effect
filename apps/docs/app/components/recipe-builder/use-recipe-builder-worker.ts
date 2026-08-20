"use client";

import { useAtom } from "@effect/atom-react";
import { TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { useSelector } from "@tanstack/react-form";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type CatalogAtomRequest,
  catalogAtom,
  previewAtom,
} from "../../atom/recipe-builder-atom";
import { RecipeBuilderCatalog } from "../../workers/recipe-builder/domain";
import {
  ownerKey,
  type RecipeBuilderFormApi,
  TargetInstance,
  toRecipePreviewInput,
} from "./form";

const reconcileTargetsWithCatalog = (
  targets: ReadonlyArray<TargetInstance>,
  catalog: typeof RecipeBuilderCatalog.Type,
) => {
  const supportedModulesByOwner = new Map(
    catalog.targetModules.map(({ owner, modules }) => [
      ownerKey(owner),
      new Set<string>(modules.map((module) => module.id)),
    ]),
  );
  const reconciliation = targets.map((target) => {
    const supported = supportedModulesByOwner.get(ownerKey(target));
    if (supported === undefined) return { target, removedModules: [] };
    const filteredModules = target.modules.filter((module) =>
      supported.has(module),
    );
    return {
      target:
        filteredModules.length === target.modules.length
          ? target
          : { ...target, modules: filteredModules },
      removedModules: target.modules.filter((module) => !supported.has(module)),
    };
  });
  const reconciled = reconciliation.map(({ target }) => target);

  return {
    targets: reconciled.every((target, index) => target === targets[index])
      ? targets
      : reconciled,
    removedModules: reconciliation.flatMap(
      ({ removedModules }) => removedModules,
    ),
  };
};

export function useRecipeBuilderWorker(
  form: RecipeBuilderFormApi,
  enabled = true,
) {
  const values = useSelector(form.store, (state) => state.values);
  const formValid = useSelector(form.store, (state) => state.isValid);
  const [catalogRequestResult, requestCatalog] = useAtom(catalogAtom);
  const [previewRequestResult, requestPreview] = useAtom(previewAtom);
  const [compatibilityNotice, setCompatibilityNotice] = useState<string>();
  const lastCatalogRequestRef = useRef<CatalogAtomRequest | undefined>(
    undefined,
  );
  const [catalogSnapshot, setCatalogSnapshot] = useState<
    | {
        readonly request: CatalogAtomRequest;
        readonly catalog: typeof RecipeBuilderCatalog.Type;
      }
    | undefined
  >(undefined);
  const { targets } = values;
  const targetIdentityKey = targets.map(ownerKey).join("\u0000");
  const catalogResult = useMemo(
    () => AsyncResult.map(catalogRequestResult, ({ catalog }) => catalog),
    [catalogRequestResult],
  );
  const catalog = catalogSnapshot?.catalog;
  const catalogOwnersByTargetId = useMemo(
    () =>
      new Map(
        catalogSnapshot?.request.targets.map(({ id, owner }) => [id, owner]) ??
          [],
      ),
    [catalogSnapshot],
  );
  const catalogFailed =
    !catalogRequestResult.waiting &&
    AsyncResult.isFailure(catalogRequestResult);
  const previewResult = useMemo(
    () => AsyncResult.map(previewRequestResult, ({ preview }) => preview),
    [previewRequestResult],
  );
  const retryCatalog = useCallback(() => {
    if (enabled && lastCatalogRequestRef.current !== undefined) {
      requestCatalog(lastCatalogRequestRef.current);
    }
  }, [enabled, requestCatalog]);

  useEffect(() => {
    if (!enabled) return;
    const request = {
      targetIdentityKey,
      targets: [
        ...targets.map(({ id, kind, name }) => ({
          id,
          owner: new TargetIdentity({ kind: TargetKind.make(kind), name }),
        })),
        {
          id: "database",
          owner: new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "db",
          }),
        },
      ],
    } as const;
    lastCatalogRequestRef.current = request;
    requestCatalog(request);
    // Module selection deliberately does not invalidate catalog metadata.
    // biome-ignore lint/correctness/useExhaustiveDependencies: targetIdentityKey captures the identity fields used by this effect.
  }, [enabled, requestCatalog, targetIdentityKey]);

  const reconcileCatalog = useEffectEvent(
    (result: typeof catalogRequestResult) => {
      if (result.waiting || !AsyncResult.isSuccess(result)) return;
      const { request, catalog: nextCatalog } = result.value;
      if (request.targetIdentityKey !== targetIdentityKey) return;

      const reconciliation = reconcileTargetsWithCatalog(targets, nextCatalog);
      setCompatibilityNotice(
        reconciliation.removedModules.length === 0
          ? undefined
          : `Removed modules that do not support the renamed target: ${reconciliation.removedModules.join(", ")}.`,
      );
      if (reconciliation.targets !== targets) {
        form.setFieldValue("targets", reconciliation.targets);
      }
    },
  );

  useEffect(() => {
    if (!enabled) return;
    reconcileCatalog(catalogRequestResult);
    if (
      !catalogRequestResult.waiting &&
      AsyncResult.isSuccess(catalogRequestResult) &&
      catalogRequestResult.value.request.targetIdentityKey === targetIdentityKey
    ) {
      setCatalogSnapshot(catalogRequestResult.value);
    }
  }, [catalogRequestResult, enabled, targetIdentityKey]);

  useEffect(() => {
    if (!enabled) {
      requestPreview(Atom.Interrupt);
      return;
    }
    if (!formValid) {
      requestPreview(Atom.Interrupt);
      return;
    }
    requestPreview({
      targetIdentityKey,
      input: toRecipePreviewInput(values),
    });
  }, [enabled, formValid, requestPreview, targetIdentityKey, values]);

  return {
    canPreview: enabled && formValid,
    catalog,
    catalogFailed,
    catalogOwnersByTargetId,
    catalogResult,
    compatibilityNotice,
    previewResult,
    retryCatalog,
  };
}

export type RecipeBuilderWorkerModel = ReturnType<
  typeof useRecipeBuilderWorker
>;
