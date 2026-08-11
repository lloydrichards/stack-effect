import { useSelector } from "@tanstack/react-form";
import { createContext, type ReactNode, use, useMemo } from "react";
import type { RecipeBuilderFormApi } from "./recipe-builder-form";
import {
  type RecipeBuilderWorkerModel,
  useRecipeBuilderWorker,
} from "./use-recipe-builder-worker";

const RecipeBuilderFormContext = createContext<
  RecipeBuilderFormApi | undefined
>(undefined);

type RecipeBuilderCatalogModel = Pick<
  RecipeBuilderWorkerModel,
  "catalog" | "catalogResult" | "compatibilityNotice" | "retryCatalog"
>;

type RecipeBuilderPreviewModel = Pick<
  RecipeBuilderWorkerModel,
  "canPreview" | "previewResult"
>;

const RecipeBuilderCatalogContext = createContext<
  RecipeBuilderCatalogModel | undefined
>(undefined);

const RecipeBuilderPreviewContext = createContext<
  RecipeBuilderPreviewModel | undefined
>(undefined);

export function RecipeBuilderProvider({
  children,
  form,
}: {
  readonly children: ReactNode;
  readonly form: RecipeBuilderFormApi;
}) {
  const values = useSelector(form.store, (state) => state.values);
  const formValid = useSelector(form.store, (state) => state.isValid);
  const worker = useRecipeBuilderWorker(form, values, formValid);
  const catalog = useMemo<RecipeBuilderCatalogModel>(
    () => ({
      catalog: worker.catalog,
      catalogResult: worker.catalogResult,
      compatibilityNotice: worker.compatibilityNotice,
      retryCatalog: worker.retryCatalog,
    }),
    [
      worker.catalog,
      worker.catalogResult,
      worker.compatibilityNotice,
      worker.retryCatalog,
    ],
  );
  const preview = useMemo<RecipeBuilderPreviewModel>(
    () => ({
      canPreview: worker.canPreview,
      previewResult: worker.previewResult,
    }),
    [worker.canPreview, worker.previewResult],
  );

  return (
    <RecipeBuilderFormContext value={form}>
      <RecipeBuilderCatalogContext value={catalog}>
        <RecipeBuilderPreviewContext value={preview}>
          {children}
        </RecipeBuilderPreviewContext>
      </RecipeBuilderCatalogContext>
    </RecipeBuilderFormContext>
  );
}

export function useRecipeBuilderFormContext() {
  const form = use(RecipeBuilderFormContext);
  if (form === undefined) {
    throw new Error(
      "useRecipeBuilderFormContext must be used inside RecipeBuilderProvider",
    );
  }
  return form;
}

export function useRecipeBuilderCatalog() {
  const catalog = use(RecipeBuilderCatalogContext);
  if (catalog === undefined) {
    throw new Error(
      "useRecipeBuilderCatalog must be used inside RecipeBuilderProvider",
    );
  }
  return catalog;
}

export function useRecipeBuilderPreview() {
  const preview = use(RecipeBuilderPreviewContext);
  if (preview === undefined) {
    throw new Error(
      "useRecipeBuilderPreview must be used inside RecipeBuilderProvider",
    );
  }
  return preview;
}
