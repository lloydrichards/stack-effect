import type { CatalogSources } from "@repo/domain/CatalogSource";
import {
  CustomCatalogSource,
  defaultCatalogSources,
  selectsOfficialCatalog,
} from "@repo/domain/CatalogSource";
import { useSelector } from "@tanstack/react-form";
import { Option, Schema } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { registryUrl } from "../../workers/recipe-builder/registry-url";
import { useRecipeBuilderForm } from "./form";
import { isMovedToLabs } from "./labs-migration";
import {
  decodeRecipeBuilderUrl,
  encodeRecipeBuilderUrl,
} from "./recipe-builder-url";

export const useRecipeBuilderUrlState = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.toString();
  const labsCatalog = useMemo(
    () =>
      typeof window === "undefined"
        ? undefined
        : Option.getOrUndefined(
            Schema.decodeOption(CustomCatalogSource)({
              name: "labs",
              url: registryUrl(
                window.location.origin,
                import.meta.env.BASE_URL,
                "labs",
              ),
            }),
          ),
    [],
  );
  const decoded = useMemo(() => {
    const result = decodeRecipeBuilderUrl(searchParams);
    if (search !== "" || labsCatalog === undefined) return result;
    return {
      ...result,
      initialValues: {
        ...result.initialValues,
        config: {
          ...result.initialValues.config,
          catalogs: [
            ...defaultCatalogSources,
            labsCatalog,
          ] satisfies CatalogSources,
        },
      },
    };
  }, [search, labsCatalog]);
  const initialValuesRef = useRef(decoded.initialValues);
  const form = useRecipeBuilderForm(initialValuesRef.current);
  const values = useSelector(form.store, (state) => state.values);
  const formValid = useSelector(form.store, (state) => state.isValid);
  const formDirty = useSelector(form.store, (state) => state.isDirty);
  const hasRecipeParams = search.length > 0;
  // Fetching a URL exposes the visitor to that host, and links come from
  // untrusted places, so custom URLs load only after this page approves them.
  const [approvedCatalogUrls, setApprovedCatalogUrls] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const catalogs = values.config.catalogs;
  const unconfirmedCatalogs = useMemo(
    () =>
      (catalogs ?? []).flatMap((source) =>
        "url" in source &&
        source.url !== undefined &&
        source.url !== labsCatalog?.url &&
        !approvedCatalogUrls.has(source.url)
          ? [{ name: source.name, url: source.url }]
          : [],
      ),
    [approvedCatalogUrls, catalogs, labsCatalog],
  );
  const approveCatalogUrls = useCallback(
    (urls: ReadonlyArray<string>) =>
      setApprovedCatalogUrls((approved) => new Set([...approved, ...urls])),
    [],
  );
  const setCatalogs = useCallback(
    (next: CatalogSources | undefined) => {
      approveCatalogUrls(
        (next ?? []).flatMap((source) => ("url" in source ? [source.url] : [])),
      );
      form.setFieldValue("config", (config) => {
        const { catalogs: _previous, ...rest } = config;
        return next === undefined ? rest : { ...rest, catalogs: next };
      });
    },
    [approveCatalogUrls, form],
  );
  const selectedSources = catalogs ?? defaultCatalogSources;
  const labsMigration =
    labsCatalog !== undefined &&
    selectsOfficialCatalog(selectedSources) &&
    !selectedSources.some(
      (source) =>
        source.name === "labs" ||
        ("url" in source && source.url === labsCatalog.url),
    ) &&
    values.targets.some((target) => target.modules.some(isMovedToLabs))
      ? {
          addLabs: () => setCatalogs([...selectedSources, labsCatalog]),
          discardMovedModules: () =>
            form.setFieldValue("targets", (targets) =>
              targets.map((target) => ({
                ...target,
                modules: target.modules.filter((id) => !isMovedToLabs(id)),
                ...(target.requirements === undefined
                  ? {}
                  : {
                      requirements: target.requirements.filter(
                        ({ sourceModuleId, moduleId }) =>
                          !isMovedToLabs(sourceModuleId) &&
                          !isMovedToLabs(moduleId),
                      ),
                    }),
              })),
            ),
        }
      : undefined;
  const confirmCatalogs = useCallback(
    () => approveCatalogUrls(unconfirmedCatalogs.map((source) => source.url)),
    [approveCatalogUrls, unconfirmedCatalogs],
  );
  const lastSearchRef = useRef(search);
  const externalNavigationPendingRef = useRef(false);
  const decodedSearch = decoded.issue
    ? undefined
    : encodeRecipeBuilderUrl(decoded.initialValues).toString();
  const formSearch = formValid
    ? encodeRecipeBuilderUrl(values).toString()
    : undefined;

  useEffect(() => {
    if (search === lastSearchRef.current) return;
    lastSearchRef.current = search;
    if (
      decodedSearch !== undefined &&
      (formSearch === undefined || decodedSearch !== formSearch)
    ) {
      externalNavigationPendingRef.current = true;
      initialValuesRef.current = decoded.initialValues;
      form.reset(decoded.initialValues);
    }
  }, [decoded.initialValues, decodedSearch, form, formSearch, search]);

  useEffect(() => {
    if (externalNavigationPendingRef.current) {
      externalNavigationPendingRef.current = false;
      return;
    }
    if (
      decoded.issue !== undefined ||
      formSearch === undefined ||
      (!hasRecipeParams && !formDirty)
    ) {
      return;
    }
    if (searchParams.toString() !== formSearch) {
      setSearchParams(new URLSearchParams(formSearch), {
        preventScrollReset: true,
        replace: true,
      });
    }
  }, [
    decoded.issue,
    formSearch,
    formDirty,
    hasRecipeParams,
    searchParams,
    setSearchParams,
  ]);

  return {
    form,
    urlIssue: decoded.issue,
    unconfirmedCatalogs,
    confirmCatalogs,
    setCatalogs,
    labsMigration,
    workerEnabled:
      decoded.issue === undefined &&
      unconfirmedCatalogs.length === 0 &&
      labsMigration === undefined,
  };
};
