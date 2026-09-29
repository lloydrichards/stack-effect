"use client";

import {
  type CatalogSource,
  CatalogSources,
  formatCatalogSource,
  OFFICIAL_CATALOG_SOURCE,
} from "@repo/domain/CatalogSource";
import { useSelector } from "@tanstack/react-form";
import { Option, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { type FormEvent, useState } from "react";
import { DisclosurePanel } from "~/components/molecules/disclosure-panel";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { recipeBuilderRpcFailure } from "../../atom/recipe-builder-atom";
import { registryUrl } from "../../workers/recipe-builder/registry-url";
import { usesOfficialCatalog } from "./form";
import {
  useRecipeBuilderCatalog,
  useRecipeBuilderFormContext,
  useRecipeBuilderUrl,
} from "./recipe-builder-context";

const lastValidated = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function CatalogSourcesPanel() {
  const form = useRecipeBuilderFormContext();
  const { catalog, catalogResult } = useRecipeBuilderCatalog();
  const { setCatalogs, unconfirmedCatalogs } = useRecipeBuilderUrl();
  const catalogs = useSelector(
    form.store,
    (state) => state.values.config.catalogs,
  );
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [issue, setIssue] = useState<string>();
  // Collapsible panels take their default once; opened for links with catalogs.
  const [openByDefault] = useState(catalogs !== undefined);
  const failure =
    !catalogResult.waiting && AsyncResult.isFailure(catalogResult)
      ? recipeBuilderRpcFailure(catalogResult.cause)
      : undefined;
  const selected = catalogs ?? [{ name: OFFICIAL_CATALOG_SOURCE }];
  const officialSelected = usesOfficialCatalog(catalogs);
  // A failed composition still reports the sources it loaded, so a missing
  // official dependency is known before the selection works.
  const requiringOfficial = (catalog?.sources ?? failure?.sources ?? [])
    .filter((source) => source.requires.includes(OFFICIAL_CATALOG_SOURCE))
    .map((source) => source.name);
  const rows: ReadonlyArray<CatalogSource> = officialSelected
    ? selected
    : [{ name: OFFICIAL_CATALOG_SOURCE }, ...selected];
  const officialUrl =
    typeof window === "undefined"
      ? undefined
      : registryUrl(window.location.origin, import.meta.env.BASE_URL);

  const statusFor = (sourceName: string) => {
    const loaded =
      catalog?.sources.find((source) => source.name === sourceName) ??
      failure?.sources?.find((source) => source.name === sourceName);
    if (failure?.failedSource?.name === sourceName)
      return <Badge variant="destructive">Failed</Badge>;
    if (unconfirmedCatalogs.some((source) => source.name === sourceName))
      return <Badge variant="outline">Awaiting confirmation</Badge>;
    if (loaded === undefined)
      return failure === undefined && unconfirmedCatalogs.length === 0 ? (
        <Badge variant="outline">Loading</Badge>
      ) : (
        <Badge variant="outline">Not loaded</Badge>
      );
    return loaded.freshness === "cached" ? (
      <Badge variant="destructive">
        Cached
        {loaded.warning
          ? ` · validated ${lastValidated.format(loaded.warning.lastValidatedAt)}`
          : ""}
      </Badge>
    ) : (
      <Badge variant="secondary">
        {loaded.warning?.kind === "persistence"
          ? "Current · not saved"
          : "Current"}
      </Badge>
    );
  };

  const addSource = (event: FormEvent) => {
    event.preventDefault();
    const next = Schema.decodeOption(CatalogSources)([
      ...selected,
      { name: name.trim(), url: url.trim() },
    ]);
    if (Option.isNone(next)) {
      setIssue(
        "Use a lowercase name that is not already selected, and an https URL (http only for localhost) that is not already selected.",
      );
      return;
    }
    setIssue(undefined);
    setName("");
    setUrl("");
    setCatalogs(next.value);
  };

  const removeSource = (sourceName: string) => {
    const remaining = selected.filter((source) => source.name !== sourceName);
    if (remaining.length === 0) return;
    setCatalogs(
      remaining.every((source) => source.name === OFFICIAL_CATALOG_SOURCE)
        ? undefined
        : Schema.decodeUnknownOption(CatalogSources)(remaining).pipe(
            Option.getOrUndefined,
          ),
    );
  };

  const addOfficial = () =>
    setCatalogs([{ name: OFFICIAL_CATALOG_SOURCE }, ...selected]);

  const officialAction = () => {
    if (!officialSelected)
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addOfficial}
          aria-label="Add catalog official"
        >
          Add
        </Button>
      );
    const locked = requiringOfficial.length > 0 || selected.length === 1;
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={locked}
        onClick={() => removeSource(OFFICIAL_CATALOG_SOURCE)}
        aria-label="Remove catalog official"
      >
        Remove
      </Button>
    );
  };

  return (
    <DisclosurePanel
      title="Catalogs"
      description="Choose the catalogs that supply targets and modules."
      defaultOpen={openByDefault}
      meta={
        <span className="font-mono text-xs text-muted-foreground">
          {selected.map((source) => source.name).join(", ")}
        </span>
      }
    >
      <div className="flex flex-col gap-4 p-4 md:p-5">
        <ul aria-label="Selected catalogs" className="flex flex-col gap-2">
          {rows.map((source) => (
            <li
              key={formatCatalogSource(source)}
              data-selected={"url" in source || officialSelected}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 data-[selected=false]:border-dashed data-[selected=false]:opacity-70"
            >
              <div className="min-w-0">
                <p className="font-mono text-sm font-medium">{source.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {"url" in source ? source.url : officialUrl}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {"url" in source || officialSelected ? (
                  statusFor(source.name)
                ) : (
                  <Badge variant="outline">Not selected</Badge>
                )}
                {"url" in source ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={selected.length === 1}
                    onClick={() => removeSource(source.name)}
                    aria-label={`Remove catalog ${source.name}`}
                  >
                    Remove
                  </Button>
                ) : (
                  officialAction()
                )}
              </div>
            </li>
          ))}
        </ul>
        <form
          aria-label="Add a catalog"
          className="grid gap-3 md:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] md:items-end"
          onSubmit={addSource}
        >
          <Field>
            <FieldLabel htmlFor="catalog-source-name">Catalog name</FieldLabel>
            <Input
              id="catalog-source-name"
              value={name}
              placeholder="acme"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="catalog-source-url">Catalog URL</FieldLabel>
            <Input
              id="catalog-source-url"
              value={url}
              placeholder="https://catalog.example.dev/registry/v1/catalog.json"
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="outline">
            Add catalog
          </Button>
        </form>
        {issue ? <FieldError>{issue}</FieldError> : null}
        <FieldDescription>
          {requiringOfficial.length > 0
            ? `The official catalog stays selected because ${requiringOfficial.join(", ")} ${requiringOfficial.length === 1 ? "requires" : "require"} it. `
            : officialSelected
              ? "To try a standalone catalog on its own, add it and remove the official catalog. "
              : "Without the official catalog, tool, database, and Git options are unavailable, and your catalogs must supply the workspace. "}
          The command and shared link include every selected catalog.
        </FieldDescription>
      </div>
    </DisclosurePanel>
  );
}

/** Names the supplying catalog once more than one catalog is selected. */
export function CatalogSourceBadge({
  source,
}: {
  readonly source: string | undefined;
}) {
  const { catalog } = useRecipeBuilderCatalog();
  return source === undefined || (catalog?.sources.length ?? 0) < 2 ? null : (
    <Badge variant="outline" className="font-mono">
      {source}
    </Badge>
  );
}
