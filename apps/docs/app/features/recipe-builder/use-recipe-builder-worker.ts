"use client";

import { useAtom } from "@effect/atom-react";
import { TargetIdentity, TargetKind } from "@repo/domain/Catalog";
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
  reconcileTargetsWithCatalog,
  targetKey,
  uniqueOwners,
} from "./builder-state";
import {
  type RecipeBuilderFormApi,
  type RecipeBuilderFormValues,
  toRecipePreviewInput,
} from "./recipe-builder-form";
import {
  type CatalogAtomRequest,
  catalogAtom,
  previewAtom,
} from "./worker/client";

export function useRecipeBuilderWorker(
  form: RecipeBuilderFormApi,
  values: RecipeBuilderFormValues,
  formValid: boolean,
) {
  const [catalogRequestResult, requestCatalog] = useAtom(catalogAtom);
  const [previewRequestResult, requestPreview] = useAtom(previewAtom);
  const [compatibilityNotice, setCompatibilityNotice] = useState<string>();
  const lastCatalogRequestRef = useRef<CatalogAtomRequest | undefined>(
    undefined,
  );
  const { targets } = values;
  const targetIdentityKey = targets.map(targetKey).join("\u0000");
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
      source: "identity",
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
      if (
        request.source !== "identity" ||
        request.targetIdentityKey !== targetIdentityKey
      )
        return;

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

  useEffect(() => {
    if (
      previewRequestResult.waiting ||
      !AsyncResult.isSuccess(previewRequestResult) ||
      previewRequestResult.value.request.targetIdentityKey !==
        targetIdentityKey ||
      catalogRequestResult.waiting ||
      !AsyncResult.isSuccess(catalogRequestResult) ||
      catalogRequestResult.value.request.targetIdentityKey !== targetIdentityKey
    )
      return;

    const owners = uniqueOwners([
      ...targets.map(
        ({ kind, name }) =>
          new TargetIdentity({ kind: TargetKind.make(kind), name }),
      ),
      ...previewRequestResult.value.preview.blueprint.nodes.flatMap((node) =>
        node._tag === "target" ? [node.identity] : [],
      ),
    ]);
    const ownersKey = owners.map(ownerKey).join("\u0000");
    const resolvedOwnersKey = catalogRequestResult.value.request.owners
      .map(ownerKey)
      .join("\u0000");
    const requestedOwnersKey = lastCatalogRequestRef.current?.owners
      .map(ownerKey)
      .join("\u0000");
    if (ownersKey === resolvedOwnersKey || ownersKey === requestedOwnersKey)
      return;
    const request = { targetIdentityKey, owners, source: "preview" } as const;
    lastCatalogRequestRef.current = request;
    requestCatalog(request);
  }, [
    catalogRequestResult,
    previewRequestResult,
    requestCatalog,
    targetIdentityKey,
    targets,
  ]);

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
