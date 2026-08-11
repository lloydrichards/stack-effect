"use client";

import { useAtom } from "@effect/atom-react";
import { TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { useSelector } from "@tanstack/react-form";
import { Option } from "effect";
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
  ownerKey,
  type RecipeBuilderFormApi,
  TargetInstance,
  toRecipePreviewInput,
} from "./form";
import {
  type CatalogAtomRequest,
  catalogAtom,
  previewAtom,
} from "./worker/client";
import { RecipeBuilderCatalog } from "./worker/domain";

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

export function useRecipeBuilderWorker(form: RecipeBuilderFormApi) {
  const values = useSelector(form.store, (state) => state.values);
  const formValid = useSelector(form.store, (state) => state.isValid);
  const [catalogRequestResult, requestCatalog] = useAtom(catalogAtom);
  const [previewRequestResult, requestPreview] = useAtom(previewAtom);
  const [compatibilityNotice, setCompatibilityNotice] = useState<string>();
  const lastCatalogRequestRef = useRef<CatalogAtomRequest | undefined>(
    undefined,
  );
  const { targets } = values;
  const targetIdentityKey = targets.map(ownerKey).join("\u0000");
  const catalogResult = useMemo(
    () => AsyncResult.map(catalogRequestResult, ({ catalog }) => catalog),
    [catalogRequestResult],
  );
  const catalog = Option.getOrUndefined(AsyncResult.value(catalogResult));
  const previewResult = useMemo(
    () => AsyncResult.map(previewRequestResult, ({ preview }) => preview),
    [previewRequestResult],
  );
  const retryCatalog = useCallback(() => {
    if (lastCatalogRequestRef.current !== undefined) {
      requestCatalog(lastCatalogRequestRef.current);
    }
  }, [requestCatalog]);

  useEffect(() => {
    const request = {
      targetIdentityKey,
      owners: targets.map(
        ({ kind, name }) =>
          new TargetIdentity({ kind: TargetKind.make(kind), name }),
      ),
    } as const;
    lastCatalogRequestRef.current = request;
    requestCatalog(request);
    // Module selection deliberately does not invalidate catalog metadata.
    // biome-ignore lint/correctness/useExhaustiveDependencies: targetIdentityKey captures the identity fields used by this effect.
  }, [requestCatalog, targetIdentityKey]);

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

  useEffect(
    () => reconcileCatalog(catalogRequestResult),
    [catalogRequestResult],
  );

  useEffect(() => {
    if (!formValid) {
      requestPreview(Atom.Interrupt);
      return;
    }
    requestPreview({
      targetIdentityKey,
      input: toRecipePreviewInput(values),
    });
  }, [formValid, requestPreview, targetIdentityKey, values]);

  return {
    canPreview: formValid,
    catalog,
    catalogResult,
    compatibilityNotice,
    previewResult,
    retryCatalog,
  };
}

export type RecipeBuilderWorkerModel = ReturnType<
  typeof useRecipeBuilderWorker
>;
