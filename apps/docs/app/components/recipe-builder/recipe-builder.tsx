"use client";

import { OFFICIAL_CATALOG_SOURCE } from "@repo/domain/CatalogSource";
import { useSelector } from "@tanstack/react-form";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { AlertCircle } from "lucide-react";
import { useLocation } from "react-router";
import { CommandDock } from "~/components/molecules/command-dock";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { trackEvent } from "~/lib/analytics";
import {
  recipeBuilderRpcErrorMessage,
  recipeBuilderRpcFailure,
} from "../../atom/recipe-builder-atom";
import { CatalogSourcesPanel } from "./catalog-sources";
import { DatabaseSelector } from "./database-selector";
import { usesOfficialCatalog } from "./form";
import {
  RecipeBuilderProvider,
  useRecipeBuilderCatalog,
  useRecipeBuilderFormContext,
  useRecipeBuilderPreview,
  useRecipeBuilderUrl,
} from "./recipe-builder-context";
import { RepositoryExplorer } from "./repository-explorer";
import { StackConfigurator } from "./stack-configurator";
import { TargetSelector } from "./target-selector";

export function RecipeBuilder() {
  return (
    <RecipeBuilderProvider>
      <RecipeBuilderContent />
    </RecipeBuilderProvider>
  );
}

function RecipeBuilderContent() {
  const form = useRecipeBuilderFormContext();
  const {
    catalog,
    catalogFailed,
    catalogResult,
    compatibilityNotice,
    retryCatalog,
  } = useRecipeBuilderCatalog();
  const { canPreview, previewResult } = useRecipeBuilderPreview();
  const { urlIssue, unconfirmedCatalogs, confirmCatalogs, setCatalogs } =
    useRecipeBuilderUrl();
  const awaitingConfirmation = unconfirmedCatalogs.length > 0;
  const catalogFailure = AsyncResult.isFailure(catalogResult)
    ? recipeBuilderRpcFailure(catalogResult.cause)
    : undefined;
  const catalogs = useSelector(
    form.store,
    (state) => state.values.config.catalogs,
  );
  const missingOfficial =
    catalogs !== undefined &&
    !usesOfficialCatalog(catalogs) &&
    catalogFailure?.issues?.some((issue) => issue.code === "missing-source");
  const cachedSources =
    catalog?.sources.filter((source) => source.freshness === "cached") ?? [];
  const location = useLocation();
  const preview = Option.getOrUndefined(AsyncResult.value(previewResult));

  const commandReady =
    canPreview &&
    AsyncResult.isSuccess(previewResult) &&
    !previewResult.waiting;
  const resolvedTargetCount = preview?.blueprint.nodes.filter(
    (node) => node._tag === "target",
  ).length;
  const command = !canPreview
    ? "Complete every target configuration to generate a command"
    : AsyncResult.builder(previewResult)
        .onInitialOrWaiting(() => "Generating command…")
        .onSuccess((current) => current.command)
        .onInterrupt(() => "Generating command…")
        .onFailure(() => "Command unavailable until the preview recovers")
        .exhaustive();
  const recipeEventData = () => {
    const { config, targets } = form.store.state.values;
    return {
      selected_target_count: targets.length,
      resolved_target_count: resolvedTargetCount ?? 0,
      selected_module_count: targets.reduce(
        (count, target) => count + target.modules.length,
        0,
      ),
      runtime: config.runtime._tag,
      package_manager:
        config.runtime._tag === "node"
          ? config.runtime.packageManager
          : config.runtime._tag,
      file_count: preview?.files.length ?? 0,
    };
  };
  const trackCommandCopy = () =>
    trackEvent("recipe-command-copied", recipeEventData());
  const trackRecipeShare = () => trackEvent("recipe-shared", recipeEventData());

  return (
    <article className="mx-auto flex w-full max-w-384 flex-col gap-6 pb-52 md:pb-32">
      <header className="flex flex-col gap-3 pb-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-heading text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            Build your Stack Effect recipe
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground md:text-base">
            Choose targets, attach their modules, and inspect the generated
            repository before running the command.
          </p>
          {catalog !== undefined && cachedSources.length === 0 ? (
            <Badge variant="secondary" className="mt-3">
              {catalog.sources.length === 1
                ? "Current catalog"
                : `${catalog.sources.length} current catalogs`}
            </Badge>
          ) : null}
        </div>
      </header>

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

      {urlIssue === undefined &&
      !awaitingConfirmation &&
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
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(source.warning?.lastValidatedAt)}
                .
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

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2 lg:gap-5 xl:grid-cols-[minmax(22rem,0.8fr)_minmax(0,1.45fr)] xl:gap-6">
        <div className="contents xl:col-start-1 xl:row-start-1 xl:flex xl:min-w-0 xl:flex-col xl:gap-6">
          <div className="min-w-0">
            <CatalogSourcesPanel />
          </div>

          <div className="min-w-0">
            <StackConfigurator />
          </div>

          <div className="min-w-0">
            <DatabaseSelector />
          </div>

          <div className="min-w-0">
            <TargetSelector />
          </div>
        </div>

        <div className="min-w-0 lg:col-span-2 xl:col-start-2 xl:row-start-1 xl:self-stretch">
          <div className="xl:sticky xl:top-20">
            <RepositoryExplorer />
          </div>
        </div>
      </div>

      <CommandDock
        summary={
          <>
            {resolvedTargetCount === undefined
              ? "Resolving targets…"
              : `${resolvedTargetCount} resolved ${resolvedTargetCount === 1 ? "target" : "targets"}`}
            {!commandReady ? (
              <Badge variant="secondary" className="ml-2">
                Not ready
              </Badge>
            ) : null}
            {cachedSources.length > 0 ? (
              <Badge variant="destructive" className="ml-2">
                Cached: {cachedSources.map((source) => source.name).join(", ")}
              </Badge>
            ) : null}
          </>
        }
        command={command}
        disabled={!commandReady}
        shareUrl={`${location.pathname}${location.search}`}
        onCopySuccess={trackCommandCopy}
        onShareSuccess={trackRecipeShare}
      />
    </article>
  );
}
