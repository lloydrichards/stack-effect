"use client";

import { OFFICIAL_CATALOG_SOURCE } from "@repo/domain/CatalogSource";
import { useSelector } from "@tanstack/react-form";
import { AsyncResult } from "effect/reactivity";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  recipeBuilderRpcErrorMessage,
  recipeBuilderRpcFailure,
} from "../../atom/recipe-builder-atom";
import { BuilderWorkspace } from "./builder-workspace";
import { usesOfficialCatalog } from "./form";
import {
  RecipeBuilderProvider,
  useRecipeBuilderCatalog,
  useRecipeBuilderFormContext,
  useRecipeBuilderPreview,
  useRecipeBuilderUrl,
} from "./recipe-builder-context";

export const RecipeBuilder = () => {
  return (
    <RecipeBuilderProvider>
      <article className="mx-auto flex w-full max-w-384 flex-col gap-5 pb-24 md:gap-6 md:pb-32">
        <header className="flex items-center justify-between gap-4">
          <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
            Recipe builder
          </h1>
        </header>

        <RecipeNotices />
        <BuilderWorkspace />
      </article>
    </RecipeBuilderProvider>
  );
};

const validatedAtFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const RecipeNotices = () => {
  const form = useRecipeBuilderFormContext();
  const {
    catalog,
    catalogFailed,
    catalogResult,
    compatibilityNotice,
    retryCatalog,
  } = useRecipeBuilderCatalog();
  const { previewResult } = useRecipeBuilderPreview();
  const {
    urlIssue,
    unconfirmedCatalogs,
    confirmCatalogs,
    setCatalogs,
    labsMigration,
  } = useRecipeBuilderUrl();
  const awaitingConfirmation = unconfirmedCatalogs.length > 0;
  const catalogFailure = AsyncResult.isFailure(catalogResult)
    ? recipeBuilderRpcFailure(catalogResult.cause)
    : undefined;
  const cachedFailureSources = catalogFailure?.sources
    ?.filter((source) => source.freshness === "cached")
    .map((source) => source.name);
  const catalogs = useSelector(
    form.store,
    (state) => state.values.config.catalogs,
  );
  const failedLabs =
    catalogFailure?.failedSource?.name === "labs" &&
    catalogs?.some((source) => source.name === "labs") &&
    usesOfficialCatalog(catalogs);
  const missingOfficial =
    catalogs !== undefined &&
    !usesOfficialCatalog(catalogs) &&
    catalogFailure?.issues?.some((issue) => issue.code === "missing-source");
  return (
    <>
      {awaitingConfirmation && urlIssue === undefined ? (
        <Alert role="alert">
          <AlertCircle />
          <AlertTitle>Load catalogs from this link?</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>
              This recipe uses catalogs from other hosts. Loading them sends a
              request from your browser to each URL.
            </span>
            <ul className="flex flex-col gap-1 font-mono text-xs">
              {unconfirmedCatalogs.map((source) => (
                <li key={source.name}>
                  {source.name} · {source.url}
                </li>
              ))}
            </ul>
            <span className="flex flex-wrap gap-3">
              <Button type="button" onClick={confirmCatalogs}>
                Load these catalogs
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCatalogs(undefined)}
              >
                Start with the official catalog
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {labsMigration && urlIssue === undefined && !awaitingConfirmation ? (
        <Alert role="alert">
          <AlertCircle />
          <AlertTitle>This recipe uses modules that moved to Labs</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              Add Labs to keep the selected modules and generate the recipe.
            </span>
            <Button type="button" onClick={labsMigration.addLabs}>
              Add Labs
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={labsMigration.discardMovedModules}
            >
              Remove moved modules
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {urlIssue === undefined &&
      !awaitingConfirmation &&
      labsMigration === undefined &&
      catalog === undefined &&
      !catalogFailed ? (
        <Alert role="status">
          <AlertTitle>Loading the recipe catalog</AlertTitle>
          <AlertDescription>
            Fetching current targets and modules before generating a preview.
          </AlertDescription>
        </Alert>
      ) : null}

      {catalogFailed ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertTitle>
            {catalogFailure?.issues
              ? "Selected catalogs do not combine"
              : catalogFailure?.failedSource
                ? `Catalog ${catalogFailure.failedSource.name} unavailable`
                : "Recipe catalog unavailable"}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {catalogFailure?.issues ? (
              <ul className="w-full list-disc pl-5">
                {catalogFailure.issues.map((issue) => (
                  <li key={`${issue.code}:${issue.message}`}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : (
              <span>
                {AsyncResult.isFailure(catalogResult)
                  ? recipeBuilderRpcErrorMessage(catalogResult.cause)
                  : "Could not load the recipe catalog."}
              </span>
            )}
            {cachedFailureSources?.length ? (
              <p className="w-full">
                Used cached catalogs for {cachedFailureSources.join(", ")}.
                Retry when the catalog sources are reachable.
              </p>
            ) : null}
            {missingOfficial ? (
              <Button
                type="button"
                onClick={() =>
                  setCatalogs([{ name: OFFICIAL_CATALOG_SOURCE }, ...catalogs])
                }
              >
                Add the official catalog
              </Button>
            ) : null}
            {failedLabs ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setCatalogs([
                    { name: OFFICIAL_CATALOG_SOURCE },
                    ...(catalogs ?? []).filter(
                      (source) =>
                        source.name !== "labs" &&
                        source.name !== OFFICIAL_CATALOG_SOURCE,
                    ),
                  ])
                }
              >
                Continue without Labs
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={retryCatalog}>
              Retry catalog
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {catalog?.sources
        .filter((source) => source.warning !== undefined)
        .map((source) => (
          <Alert role="status" key={source.name}>
            <AlertCircle />
            <AlertTitle>
              {source.freshness === "cached"
                ? `Using cached catalog ${source.name}`
                : `Catalog ${source.name} could not be saved`}
            </AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>
                {source.sourceUrl} · Last validated{" "}
                {validatedAtFormat.format(source.warning?.lastValidatedAt)}.
                {source.freshness === "cached"
                  ? " The registry is unavailable."
                  : " This preview is current, but may not be available offline."}
              </span>
              {source.freshness === "cached" ? (
                <Button type="button" variant="outline" onClick={retryCatalog}>
                  Retry catalog
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ))}

      {AsyncResult.builder(previewResult)
        .onInitialOrWaiting(() => null)
        .onInterrupt(() => null)
        .onFailure((cause) => (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Preview could not be generated</AlertTitle>
            <AlertDescription>
              {recipeBuilderRpcErrorMessage(cause)}
            </AlertDescription>
          </Alert>
        ))
        .orNull()}

      {compatibilityNotice ? (
        <Alert>
          <AlertCircle />
          <AlertTitle>Selection adjusted</AlertTitle>
          <AlertDescription>{compatibilityNotice}</AlertDescription>
        </Alert>
      ) : null}

      {urlIssue ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Shared recipe could not be restored</AlertTitle>
          <AlertDescription>{urlIssue}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
};
