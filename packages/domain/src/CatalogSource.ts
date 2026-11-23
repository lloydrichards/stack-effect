import { Schema } from "effect";
import { CatalogIssue } from "./Catalog";

/** Reserved source name whose URL the application supplies. */
export const OFFICIAL_CATALOG_SOURCE = "official";

/** `catalogId` of the official catalog document. */
export const OFFICIAL_CATALOG_ID = "stack-effect-official";

/** Production URL of the official catalog document. */
export const OFFICIAL_CATALOG_URL =
  "https://stack-effect.lloydrichards.dev/registry/v1/catalog.json";

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

/**
 * One validated catalog document as a cache stores it.
 *
 * **When to use**
 *
 * Implement a `CatalogCache` adapter, such as a file or IndexedDB store.
 *
 * **Gotchas**
 *
 * Adapters must publish the complete entry atomically and return a copy of
 * `bytes`, so a caller cannot mutate the stored document.
 */
export const CatalogCacheEntry = Schema.Struct({
  sourceUrl: Schema.String,
  bytes: Schema.Uint8Array,
  digest: Schema.String,
  etag: Schema.optional(Schema.String),
  lastModified: Schema.optional(Schema.String),
  validatedAt: Schema.Number,
});
export type CatalogCacheEntry = typeof CatalogCacheEntry.Type;

/**
 * A cache adapter could not read or write an entry.
 *
 * **When to use**
 *
 * Fail a `CatalogCache` operation with it. Catalog loading treats it as a
 * cache miss or a persistence warning, never as a load failure.
 */
export class CatalogCacheFailure extends Schema.TaggedError<CatalogCacheFailure>()(
  "CatalogCacheFailure",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

/** The source cannot be fetched as given, such as a URL that is not `http:` or `https:`. */
export class CatalogSourceInvalid extends Schema.TaggedError<CatalogSourceInvalid>()(
  "CatalogSourceInvalid",
  {},
) {}

/** A transient fetch failure; a cached document may stand in for it. */
export class CatalogUnavailable extends Schema.TaggedError<CatalogUnavailable>()(
  "CatalogUnavailable",
  {
    /** The retryable HTTP status the server answered with, if any. */
    status: Schema.optional(Schema.Int),
  },
) {}

/** The catalog request did not finish within the load timeout. */
export class CatalogTimedOut extends Schema.TaggedError<CatalogTimedOut>()(
  "CatalogTimedOut",
  { timeoutMillis: Schema.Int },
) {}

/** The server answered with a status that retrying will not fix. */
export class CatalogHttpStatusRejected extends Schema.TaggedError<CatalogHttpStatusRejected>()(
  "CatalogHttpStatusRejected",
  { status: Schema.Int },
) {}

/** The response is not served as JSON. */
export class CatalogContentTypeInvalid extends Schema.TaggedError<CatalogContentTypeInvalid>()(
  "CatalogContentTypeInvalid",
  { contentType: Schema.String },
) {}

/** The response is not UTF-8 JSON. */
export class CatalogJsonInvalid extends Schema.TaggedError<CatalogJsonInvalid>()(
  "CatalogJsonInvalid",
  {},
) {}

/** The JSON is not a valid catalog document. */
export class CatalogDocumentInvalid extends Schema.TaggedError<CatalogDocumentInvalid>()(
  "CatalogDocumentInvalid",
  {},
) {}

/** The document declares a format version this build cannot read. */
export class CatalogFormatUnsupported extends Schema.TaggedError<CatalogFormatUnsupported>()(
  "CatalogFormatUnsupported",
  {},
) {}

/** The document requires a capability this build does not support. */
export class CatalogCapabilityUnsupported extends Schema.TaggedError<CatalogCapabilityUnsupported>()(
  "CatalogCapabilityUnsupported",
  {},
) {}

/** The response exceeds the maximum catalog size. */
export class CatalogContentTooLarge extends Schema.TaggedError<CatalogContentTooLarge>()(
  "CatalogContentTooLarge",
  { maxBytes: Schema.Int },
) {}

/**
 * Why one catalog source could not be loaded.
 *
 * **When to use**
 *
 * Match on `CatalogLoadFailure.reason._tag` to choose a message or a retry.
 * Only `CatalogUnavailable` and `CatalogTimedOut` are transient.
 */
export const CatalogLoadReason = Schema.Union([
  CatalogSourceInvalid,
  CatalogUnavailable,
  CatalogTimedOut,
  CatalogHttpStatusRejected,
  CatalogContentTypeInvalid,
  CatalogJsonInvalid,
  CatalogDocumentInvalid,
  CatalogFormatUnsupported,
  CatalogCapabilityUnsupported,
  CatalogContentTooLarge,
]);
export type CatalogLoadReason = typeof CatalogLoadReason.Type;

/**
 * A selected catalog source had no usable document.
 *
 * **When to use**
 *
 * Handle it wherever catalog sources are loaded; `message` already names the
 * source URL, and `reason` says what went wrong.
 */
export class CatalogLoadFailure extends Schema.TaggedError<CatalogLoadFailure>()(
  "CatalogLoadFailure",
  {
    reason: CatalogLoadReason,
    sourceUrl: Schema.String,
    message: Schema.String,
    /** Selected source name, when the failure came from `loadSources`. */
    sourceName: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Defect()),
  },
) {}

/**
 * A catalog loaded, but from a stale cache or without being cached.
 *
 * **When to use**
 *
 * Show it next to the result so the user knows the catalog may be outdated.
 */
export const CatalogLoadWarning = Schema.Struct({
  kind: Schema.Literals(["stale", "persistence"]),
  sourceUrl: Schema.String,
  lastValidatedAt: Schema.Number,
  message: Schema.String,
});
export type CatalogLoadWarning = typeof CatalogLoadWarning.Type;

/**
 * One selected source as it was loaded for this operation.
 *
 * **When to use**
 *
 * Report which catalogs an operation used, or persist and compare a selection.
 */
export const LoadedCatalogSource = Schema.Struct({
  name: Schema.String,
  sourceUrl: Schema.String,
  /** Sources this document declares it depends on, such as `official`. */
  requires: Schema.Array(Schema.Literal("official")),
  digest: Schema.String,
  freshness: Schema.Literals(["current", "cached"]),
  warning: Schema.optional(CatalogLoadWarning),
});
export type LoadedCatalogSource = typeof LoadedCatalogSource.Type;

const describeSource = (source: LoadedCatalogSource) =>
  `${source.name} (${source.sourceUrl}, ${
    source.warning?.kind === "stale"
      ? `cached, last validated at ${source.warning.lastValidatedAt} ms since epoch`
      : source.freshness
  })`;

/**
 * Every selected source loaded, but their definitions do not form one catalog.
 *
 * **When to use**
 *
 * Handle it next to `CatalogLoadFailure` when loading several sources.
 *
 * **Gotchas**
 *
 * When any source came from cache, the message suggests retrying once the
 * sources are reachable, because they may compose after a refresh.
 */
export class CatalogCompositionFailure extends Schema.TaggedError<CatalogCompositionFailure>()(
  "CatalogCompositionFailure",
  {
    issues: Schema.Array(CatalogIssue),
    sources: Schema.Array(LoadedCatalogSource),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    const refreshHint = this.sources.some(
      (source) => source.freshness === "cached",
    )
      ? " Retry when the catalog sources are reachable so they can be refreshed together."
      : "";

    return `Selected catalogs do not compose: ${this.issues
      .map((issue) => issue.message)
      .join(
        "; ",
      )}. Sources: ${this.sources.map(describeSource).join(", ")}.${refreshHint}`;
  }
}
