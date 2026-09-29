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
const absoluteUrl = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)[^#]*$/i;

const catalogUrlIssue = (value: string): string | undefined => {
  if (value.includes("#"))
    return `Catalog URL must not contain a fragment: ${value}`;
  const match = absoluteUrl.exec(value);
  if (match === null) return `Catalog URL must be absolute: ${value}`;
  const scheme = match[1]!.toLowerCase();
  const authority = match[2]!;
  if (authority.includes("@"))
    return "Catalog URL must not contain credentials";
  const host = authority.replace(/:\d+$/, "").toLowerCase();
  if (scheme === "http" && !loopbackHosts.has(host))
    return `Catalog URL must use https unless it targets a loopback host: ${value}`;
  if (scheme !== "https" && scheme !== "http")
    return `Catalog URL must use https: ${value}`;
  return undefined;
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
