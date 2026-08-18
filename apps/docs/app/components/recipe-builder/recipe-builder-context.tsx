import { createContext, type ReactNode, use, useMemo } from "react";
import { type RecipeBuilderFormApi } from "./form";
import { useRecipeBuilderUrlState } from "./use-recipe-builder-url-state";
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

type RecipeBuilderUrlModel = {
  readonly urlIssue: string | undefined;
};

const RecipeBuilderCatalogContext = createContext<
  RecipeBuilderCatalogModel | undefined
>(undefined);

const RecipeBuilderPreviewContext = createContext<
  RecipeBuilderPreviewModel | undefined
>(undefined);

const RecipeBuilderUrlContext = createContext<
  RecipeBuilderUrlModel | undefined
>(undefined);

export function RecipeBuilderProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const urlState = useRecipeBuilderUrlState();
  const worker = useRecipeBuilderWorker(urlState.form, urlState.workerEnabled);
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
  const url = useMemo<RecipeBuilderUrlModel>(
    () => ({ urlIssue: urlState.urlIssue }),
    [urlState.urlIssue],
  );

  return (
    <RecipeBuilderFormContext value={urlState.form}>
      <RecipeBuilderCatalogContext value={catalog}>
        <RecipeBuilderPreviewContext value={preview}>
          <RecipeBuilderUrlContext value={url}>
            {children}
          </RecipeBuilderUrlContext>
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

export function useRecipeBuilderUrl() {
  const url = use(RecipeBuilderUrlContext);
  if (url === undefined) {
    throw new Error(
      "useRecipeBuilderUrl must be used inside RecipeBuilderProvider",
    );
  }
  return url;
}
