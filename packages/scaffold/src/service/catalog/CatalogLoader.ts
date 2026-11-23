import { CatalogService, decodeCatalogDocument } from "@repo/catalog";
import {
  CatalogCapabilityError,
  type CatalogDocument,
  CatalogIssue,
  type CatalogValidationError,
} from "@repo/domain/Catalog";
import {
  type CatalogSources,
  selectsOfficialCatalog,
} from "@repo/domain/CatalogSource";
import { Clock, Context, Effect, Layer, Result, Schema, Stream } from "effect";
import * as Digest from "effect/crypto/Digest";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { CatalogCache, type CatalogCacheEntry } from "./CatalogCache";

const MIB = 1024 * 1024;
const MAX_CATALOG_BYTES = 8 * MIB;
const CATALOG_TIMEOUT_MILLIS = 15_000;

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

export class CatalogTimedOut extends Schema.TaggedError<CatalogTimedOut>()(
  "CatalogTimedOut",
  { timeoutMillis: Schema.Int },
) {}

export class CatalogHttpStatusRejected extends Schema.TaggedError<CatalogHttpStatusRejected>()(
  "CatalogHttpStatusRejected",
  { status: Schema.Int },
) {}

export class CatalogContentTypeInvalid extends Schema.TaggedError<CatalogContentTypeInvalid>()(
  "CatalogContentTypeInvalid",
  { contentType: Schema.String },
) {}

export class CatalogJsonInvalid extends Schema.TaggedError<CatalogJsonInvalid>()(
  "CatalogJsonInvalid",
  {},
) {}

export class CatalogDocumentInvalid extends Schema.TaggedError<CatalogDocumentInvalid>()(
  "CatalogDocumentInvalid",
  {},
) {}

export class CatalogFormatUnsupported extends Schema.TaggedError<CatalogFormatUnsupported>()(
  "CatalogFormatUnsupported",
  {},
) {}

export class CatalogCapabilityUnsupported extends Schema.TaggedError<CatalogCapabilityUnsupported>()(
  "CatalogCapabilityUnsupported",
  {},
) {}

export class CatalogContentTooLarge extends Schema.TaggedError<CatalogContentTooLarge>()(
  "CatalogContentTooLarge",
  { maxBytes: Schema.Int },
) {}

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

export const CatalogLoadWarning = Schema.Struct({
  kind: Schema.Literals(["stale", "persistence"]),
  sourceUrl: Schema.String,
  lastValidatedAt: Schema.Number,
  message: Schema.String,
});
export type CatalogLoadWarning = typeof CatalogLoadWarning.Type;

type LoadedDocument<A> = {
  readonly value: A;
  /** Entry to cache once the caller has finished validating the document. */
  readonly pending?: CatalogCacheEntry | undefined;
  readonly sourceUrl: string;
  readonly digest: string;
  readonly freshness: "current" | "cached";
  readonly warning?: CatalogLoadWarning | undefined;
};

export type LoadedCatalog = {
  readonly catalog: CatalogService["Service"];
  readonly sourceUrl: string;
  readonly digest: string;
  readonly freshness: "current" | "cached";
  readonly warning?: CatalogLoadWarning | undefined;
};

/** One selected source as it was loaded for this operation. */
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

export type LoadedCatalogSet = {
  readonly catalog: CatalogService["Service"];
  readonly sources: ReadonlyArray<LoadedCatalogSource>;
};

const describeSource = (source: LoadedCatalogSource) =>
  `${source.name} (${source.sourceUrl}, ${
    source.warning?.kind === "stale"
      ? `cached, last validated at ${source.warning.lastValidatedAt} ms since epoch`
      : source.freshness
  })`;

/** Every selected source loaded, but their definitions do not form one catalog. */
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

const failure = (
  reason: CatalogLoadReason,
  sourceUrl: string,
  message: string,
  cause?: unknown,
) => new CatalogLoadFailure({ reason, sourceUrl, message, cause });

const normalizedUrl = Effect.fnUntraced(function* (sourceUrl: string) {
  const url = yield* Effect.try({
    try: () => new URL(sourceUrl),
    catch: (cause) =>
      failure(
        new CatalogSourceInvalid(),
        sourceUrl,
        `Invalid catalog URL: ${sourceUrl}`,
        cause,
      ),
  });
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return yield* failure(
      new CatalogSourceInvalid(),
      sourceUrl,
      `Invalid catalog URL: ${sourceUrl}`,
    );
  url.hash = "";
  return url.toString();
});

const persistenceWarningFor = (
  sourceUrl: string,
  validatedAt: number,
): CatalogLoadWarning => ({
  kind: "persistence",
  sourceUrl,
  lastValidatedAt: validatedAt,
  message: `Catalog from ${sourceUrl} is current, but it could not be cached.`,
});

const isTransient = (error: CatalogLoadFailure) =>
  error.reason._tag === "CatalogUnavailable" ||
  error.reason._tag === "CatalogTimedOut";

export class CatalogLoader extends Context.Service<
  CatalogLoader,
  {
    readonly load: (input: {
      readonly sourceUrl: string;
      // Application-owned authority. Never inferred from a downloaded catalogId.
      readonly allowFinalizeScripts?: boolean;
    }) => Effect.Effect<LoadedCatalog, CatalogLoadFailure>;
    // Loads every selected source, then composes them once. Any source without
    // usable data fails the whole selection.
    readonly loadSources: (input: {
      readonly sources: CatalogSources;
      // Application-owned URL for the reserved `official` source.
      readonly officialUrl: string;
    }) => Effect.Effect<
      LoadedCatalogSet,
      CatalogLoadFailure | CatalogCompositionFailure
    >;
  }
>()("@repo/scaffold/CatalogLoader") {
  static readonly layer = Layer.effect(
    CatalogLoader,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const cache = yield* CatalogCache;
      const crypto = yield* Digest.Digest;

      const decodeBytes = Effect.fnUntraced(function* <A>(
        bytes: Uint8Array,
        sourceUrl: string,
        check: (
          document: CatalogDocument,
        ) => Effect.Effect<A, CatalogLoadFailure>,
      ) {
        const digest = yield* crypto.digestHex(Digest.sha256, bytes);
        const text = yield* Effect.try({
          try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          catch: (cause) =>
            failure(
              new CatalogJsonInvalid(),
              sourceUrl,
              `Catalog from ${sourceUrl} is not UTF-8.`,
              cause,
            ),
        });
        const json = yield* Schema.decodeEffect(
          Schema.fromJsonString(Schema.Unknown),
        )(text).pipe(
          Effect.mapError((cause) =>
            failure(
              new CatalogJsonInvalid(),
              sourceUrl,
              `Catalog from ${sourceUrl} is not valid JSON.`,
              cause,
            ),
          ),
        );
        if (
          typeof json === "object" &&
          json !== null &&
          "formatVersion" in json &&
          json.formatVersion !== 1
        )
          return yield* failure(
            new CatalogFormatUnsupported(),
            sourceUrl,
            `Catalog from ${sourceUrl} uses an unsupported formatVersion.`,
          );
        const document = yield* decodeCatalogDocument(json).pipe(
          Effect.mapError((error) =>
            error instanceof CatalogCapabilityError
              ? failure(
                  new CatalogCapabilityUnsupported(),
                  sourceUrl,
                  error.message,
                  error,
                )
              : failure(
                  new CatalogDocumentInvalid(),
                  sourceUrl,
                  `Invalid catalog from ${sourceUrl}: ${error.message}`,
                  error,
                ),
          ),
        );
        const value = yield* check(document);
        return { value, digest };
      });

      const readBounded = Effect.fnUntraced(function* (
        response: HttpClientResponse.HttpClientResponse,
        sourceUrl: string,
      ) {
        const chunks: Array<Uint8Array> = [];
        let size = 0;
        const accept = Effect.fnUntraced(function* (chunk: Uint8Array) {
          size += chunk.byteLength;
          if (size > MAX_CATALOG_BYTES)
            return yield* failure(
              new CatalogContentTooLarge({ maxBytes: MAX_CATALOG_BYTES }),
              sourceUrl,
              `Catalog from ${sourceUrl} exceeds ${MAX_CATALOG_BYTES / MIB} MiB.`,
            );
          chunks.push(chunk);
        });

        yield* response.stream.pipe(
          Stream.mapError((error) =>
            failure(
              new CatalogUnavailable(),
              sourceUrl,
              `Could not read catalog response from ${sourceUrl}.`,
              error,
            ),
          ),
          Stream.runForEach(accept),
        );

        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return bytes;
      });

      const writeCache = (entry: CatalogCacheEntry) =>
        cache.write(entry).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        );

      const readCached = Effect.fnUntraced(function* <A>(
        sourceUrl: string,
        check: (
          document: CatalogDocument,
        ) => Effect.Effect<A, CatalogLoadFailure>,
      ) {
        const entry = yield* cache.read(sourceUrl);
        if (entry === undefined || entry.sourceUrl !== sourceUrl)
          return undefined;
        const bytes = new Uint8Array(entry.bytes);
        const digest = yield* crypto.digestHex(Digest.sha256, bytes);
        if (digest !== entry.digest) return undefined;
        const decoded = yield* decodeBytes(bytes, sourceUrl, check);
        return { entry: { ...entry, bytes }, ...decoded };
      });

      const loadDocument = Effect.fnUntraced(function* <A>(
        inputUrl: string,
        check: (
          document: CatalogDocument,
        ) => Effect.Effect<A, CatalogLoadFailure>,
        // Hand the fetched entry back instead of caching it, for callers whose
        // validation finishes only after this document joins others.
        deferPersistence = false,
      ) {
        const sourceUrl = yield* normalizedUrl(inputUrl);
        const startedAt = yield* Clock.currentTimeMillis;
        const cached = yield* readCached(sourceUrl, check).pipe(
          Effect.timeout(CATALOG_TIMEOUT_MILLIS),
          Effect.orElseSucceed(() => undefined),
        );

        let pending: CatalogCacheEntry | undefined;
        const persist = Effect.fnUntraced(function* (entry: CatalogCacheEntry) {
          if (deferPersistence) {
            pending = entry;
            return true;
          }
          return yield* writeCache(entry);
        });
        const persistenceWarning = (validatedAt: number) =>
          persistenceWarningFor(sourceUrl, validatedAt);

        const fetchCurrent = Effect.fnUntraced(function* () {
          for (let attempt = 0; attempt < 2; attempt++) {
            let request = HttpClientRequest.get(sourceUrl).pipe(
              HttpClientRequest.setHeader("accept", "application/json"),
            );
            if (attempt === 0 && cached?.entry.etag)
              request = HttpClientRequest.setHeader(
                request,
                "if-none-match",
                cached.entry.etag,
              );
            if (attempt === 0 && cached?.entry.lastModified)
              request = HttpClientRequest.setHeader(
                request,
                "if-modified-since",
                cached.entry.lastModified,
              );
            const response = yield* client.execute(request).pipe(
              // Trace headers are not CORS-safelisted, so a browser would
              // preflight every catalog fetch, and hosts need not allow them.
              Effect.provideService(HttpClient.TracerPropagationEnabled, false),
              Effect.mapError((cause) =>
                failure(
                  new CatalogUnavailable(),
                  sourceUrl,
                  `Could not fetch catalog from ${sourceUrl}.`,
                  cause,
                ),
              ),
            );
            if (response.status === 304) {
              if (cached !== undefined) {
                const validatedAt = yield* Clock.currentTimeMillis;
                const written = yield* persist({
                  ...cached.entry,
                  validatedAt,
                });
                return {
                  value: cached.value,
                  sourceUrl,
                  digest: cached.digest,
                  freshness: "current" as const,
                  warning: written
                    ? undefined
                    : persistenceWarning(validatedAt),
                };
              }
              if (attempt === 0) continue;
              return yield* failure(
                new CatalogUnavailable(),
                sourceUrl,
                `Catalog server returned 304 without usable cached data at ${sourceUrl}.`,
              );
            }
            if (
              response.status === 408 ||
              response.status === 429 ||
              (response.status >= 500 && response.status < 600)
            )
              return yield* failure(
                new CatalogUnavailable({ status: response.status }),
                sourceUrl,
                `Catalog server returned HTTP ${response.status} at ${sourceUrl}.`,
              );
            if (response.status !== 200)
              return yield* failure(
                new CatalogHttpStatusRejected({ status: response.status }),
                sourceUrl,
                `Catalog server returned HTTP ${response.status} at ${sourceUrl}.`,
              );
            const contentType = response.headers["content-type"] ?? "";
            if (
              !/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|\s*$)/i.test(
                contentType,
              )
            )
              return yield* failure(
                new CatalogContentTypeInvalid({ contentType }),
                sourceUrl,
                `Catalog response from ${sourceUrl} is not JSON.`,
              );
            const bytes = yield* readBounded(response, sourceUrl);
            const decoded = yield* decodeBytes(bytes, sourceUrl, check);
            const validatedAt = yield* Clock.currentTimeMillis;
            const entry: CatalogCacheEntry = {
              sourceUrl,
              bytes,
              digest: decoded.digest,
              validatedAt,
              ...(response.headers["etag"]
                ? { etag: response.headers["etag"] }
                : {}),
              ...(response.headers["last-modified"]
                ? { lastModified: response.headers["last-modified"] }
                : {}),
            };
            const written = yield* persist(entry);
            return {
              value: decoded.value,
              sourceUrl,
              digest: decoded.digest,
              freshness: "current" as const,
              warning: written ? undefined : persistenceWarning(validatedAt),
            };
          }
          return yield* failure(
            new CatalogUnavailable(),
            sourceUrl,
            `Catalog server returned no usable document at ${sourceUrl}.`,
          );
        });

        const timedOut = (cause?: unknown) =>
          failure(
            new CatalogTimedOut({ timeoutMillis: CATALOG_TIMEOUT_MILLIS }),
            sourceUrl,
            `Catalog load timed out after ${CATALOG_TIMEOUT_MILLIS / 1000} seconds at ${sourceUrl}.`,
            cause,
          );
        const elapsed = (yield* Clock.currentTimeMillis) - startedAt;
        const remaining = CATALOG_TIMEOUT_MILLIS - elapsed;
        const current =
          remaining <= 0
            ? Effect.fail(timedOut())
            : fetchCurrent().pipe(
                Effect.timeout(remaining),
                Effect.catchTag("TimeoutError", (error) =>
                  Effect.fail(timedOut(error)),
                ),
              );

        if (cached === undefined) {
          const loaded: LoadedDocument<A> = yield* current;
          return { ...loaded, pending };
        }

        const loaded: LoadedDocument<A> = yield* current.pipe(
          Effect.catchIf(isTransient, () =>
            Effect.succeed({
              value: cached.value,
              sourceUrl,
              digest: cached.digest,
              freshness: "cached" as const,
              warning: {
                kind: "stale" as const,
                sourceUrl,
                lastValidatedAt: cached.entry.validatedAt,
                message: `Using cached catalog from ${sourceUrl}; last validated at ${cached.entry.validatedAt} ms since epoch.`,
              },
            }),
          ),
        );
        return { ...loaded, pending };
      });

      const load = Effect.fn("CatalogLoader.load")(function* ({
        sourceUrl,
        allowFinalizeScripts = false,
      }: Parameters<CatalogLoader["Service"]["load"]>[0]) {
        const { value, ...loaded } = yield* loadDocument(
          sourceUrl,
          (document) =>
            CatalogService.pipe(
              Effect.provide(
                CatalogService.fromFragments(
                  [document],
                  allowFinalizeScripts ? { trustedFragmentIndex: 0 } : {},
                ),
              ),
              Effect.mapError((error: CatalogValidationError) =>
                failure(
                  new CatalogDocumentInvalid(),
                  sourceUrl,
                  error.message,
                  error,
                ),
              ),
            ),
        );
        return { ...loaded, catalog: value } satisfies LoadedCatalog;
      });

      const loadSources = Effect.fn("CatalogLoader.loadSources")(function* ({
        sources,
        officialUrl,
      }: Parameters<CatalogLoader["Service"]["loadSources"]>[0]) {
        const officialAlias = selectsOfficialCatalog(sources)
          ? sources.find(
              (source) => "url" in source && source.url === officialUrl,
            )
          : undefined;
        if (officialAlias !== undefined)
          return yield* new CatalogLoadFailure({
            reason: new CatalogSourceInvalid(),
            sourceUrl: officialUrl,
            sourceName: officialAlias.name,
            message: `Catalog source ${officialAlias.name} repeats the official catalog URL; select it once as official.`,
          });

        const results = yield* Effect.forEach(
          sources,
          (source) =>
            loadDocument(
              "url" in source ? source.url : officialUrl,
              (document) => Effect.succeed(document),
              true,
            ).pipe(
              Effect.map(({ value, pending, ...rest }) => ({
                document: value,
                pending,
                source: {
                  name: source.name,
                  requires: value.requires ?? [],
                  ...rest,
                },
              })),
              Effect.mapError(
                (error) =>
                  new CatalogLoadFailure({
                    reason: error.reason,
                    sourceUrl: error.sourceUrl,
                    sourceName: source.name,
                    message: `Catalog source ${source.name}: ${error.message}`,
                    cause: error.cause,
                  }),
              ),
              Effect.result,
            ),
          { concurrency: "unbounded" },
        );
        // Report the first failure in selection order, however the fetches raced.
        const failed = results.find(Result.isFailure);
        if (failed !== undefined) return yield* failed.failure;
        const loaded = results
          .filter(Result.isSuccess)
          .map((result) => result.success);

        const composedSources = loaded.map(({ source }) => source);
        const catalog = yield* CatalogService.pipe(
          Effect.provide(
            CatalogService.fromFragments(
              loaded.map(({ document }) => document),
              {
                allowFinalizeScripts: true,
                sources: loaded.map(({ document, source }) => ({
                  name: source.name,
                  requires: document.requires ?? [],
                })),
              },
            ),
          ),
          Effect.mapError(
            (error: CatalogValidationError) =>
              new CatalogCompositionFailure({
                issues: error.details,
                sources: composedSources,
                cause: error,
              }),
          ),
        );

        // Only a selection that composed may replace any source's last validated entry.
        const loadedSources: Array<LoadedCatalogSource> = [];
        for (const { source, pending } of loaded) {
          if (pending === undefined) {
            loadedSources.push(source);
            continue;
          }
          const written = yield* writeCache(pending);
          loadedSources.push(
            written
              ? source
              : {
                  ...source,
                  warning: persistenceWarningFor(
                    source.sourceUrl,
                    pending.validatedAt,
                  ),
                },
          );
        }
        return { catalog, sources: loadedSources } satisfies LoadedCatalogSet;
      });

      return CatalogLoader.of({ load, loadSources });
    }),
  );
}
