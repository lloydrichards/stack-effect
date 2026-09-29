import { Schema } from "effect";

/** Reserved source name whose URL the application supplies. */
export const OFFICIAL_CATALOG_SOURCE = "official";

export const CatalogSourceName = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9-]{0,31}$/, {
    message:
      "Catalog source names must start with a lowercase letter and contain at most 32 lowercase letters, digits, or hyphens",
  }),
  Schema.makeFilter((name) =>
    name === OFFICIAL_CATALOG_SOURCE
      ? `"${OFFICIAL_CATALOG_SOURCE}" is reserved and takes no url`
      : undefined,
  ),
).pipe(Schema.brand("CatalogSourceName"));

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Domain code has no WHATWG URL global, so split the parts the rules need.
const absoluteUrl =
  /^(?<scheme>[a-z][a-z0-9+.-]*):\/\/(?<authority>[^/?#\s]*)[^#\s]*$/i;
const hostAndPort = /^(?<host>\[[0-9a-f:.]+\]|[^:[\]]+)(?::(?<port>\d+))?$/i;

const catalogUrlIssue = (value: string): string | undefined => {
  const parts = absoluteUrl.exec(value)?.groups;
  const scheme = parts?.["scheme"]?.toLowerCase();
  const authority = parts?.["authority"] ?? "";
  const address = hostAndPort.exec(authority)?.groups;
  const host = address?.["host"]?.toLowerCase();
  const port = Number(address?.["port"] ?? 0);
  return value.includes("#")
    ? `Catalog URL must not contain a fragment: ${value}`
    : parts === undefined
      ? `Catalog URL must be absolute, without whitespace: ${value}`
      : authority.includes("@")
        ? "Catalog URL must not contain credentials"
        : host === undefined || port > 65_535
          ? `Catalog URL must name a host and a valid port: ${value}`
          : scheme !== "https" && scheme !== "http"
            ? `Catalog URL must use https: ${value}`
            : scheme === "http" && !loopbackHosts.has(host)
              ? `Catalog URL must use https unless it targets a loopback host: ${value}`
              : undefined;
};

/** Absolute https URL, or http on a loopback host for local previews. */
export const CatalogSourceUrl = Schema.String.check(
  Schema.makeFilter(catalogUrlIssue),
).pipe(Schema.brand("CatalogSourceUrl"));

export const OfficialCatalogSource = Schema.Struct({
  name: Schema.Literal(OFFICIAL_CATALOG_SOURCE),
  url: Schema.optionalKey(Schema.Never),
});

export const CustomCatalogSource = Schema.Struct({
  name: CatalogSourceName,
  url: CatalogSourceUrl,
});

export const CatalogSource = Schema.Union([
  OfficialCatalogSource,
  CustomCatalogSource,
]);
export type CatalogSource = typeof CatalogSource.Type;

const duplicates = (values: ReadonlyArray<string>) => [
  ...new Set(values.filter((value, index) => values.indexOf(value) !== index)),
];

/** An explicit, non-empty selection. Order is kept for display only. */
export const CatalogSources = Schema.NonEmptyArray(CatalogSource).check(
  Schema.makeFilter((sources) => [
    ...duplicates(sources.map((source) => source.name)).map(
      (name) => `Catalog source ${name} is listed more than once`,
    ),
    ...duplicates(
      sources.flatMap((source) => ("url" in source ? [source.url] : [])),
    ).map((url) => `Catalog URL ${url} is listed under more than one name`),
  ]),
);
export type CatalogSources = typeof CatalogSources.Type;

/** Absent configuration selects only the official source. */
export const defaultCatalogSources: CatalogSources = [
  { name: OFFICIAL_CATALOG_SOURCE },
];

/** `name` for the official source, `name=url` otherwise, as the CLI flag spells it. */
export const formatCatalogSource = (source: CatalogSource): string =>
  "url" in source ? `${source.name}=${source.url}` : source.name;

export const formatCatalogSources = (sources: ReadonlyArray<CatalogSource>) =>
  sources.map(formatCatalogSource).join(", ");

/** Order carries no meaning, so compare selections as sets. */
export const sameCatalogSources = (a: CatalogSources, b: CatalogSources) => {
  const keys = new Set(a.map(formatCatalogSource));
  return (
    a.length === b.length &&
    b.every((source) => keys.has(formatCatalogSource(source)))
  );
};

export const selectsOfficialCatalog = (sources: ReadonlyArray<CatalogSource>) =>
  sources.some((source) => source.name === OFFICIAL_CATALOG_SOURCE);

/** A named source other than the official one; its scripts need explicit trust. */
export const isCustomCatalogSource = (name: string | undefined) =>
  name !== undefined && name !== OFFICIAL_CATALOG_SOURCE;
