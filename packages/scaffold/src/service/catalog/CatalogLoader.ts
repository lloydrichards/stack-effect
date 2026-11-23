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

const maxBytes = 8 * 1024 * 1024;
const timeoutMillis = 15_000;

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
  readonly pending?: CatalogCacheEntry;
  readonly sourceUrl: string;
  readonly digest: string;
  readonly freshness: "current" | "cached";
  readonly warning?: CatalogLoadWarning;
};

export type LoadedCatalog = {
  readonly catalog: typeof CatalogService.Service;
  readonly sourceUrl: string;
  readonly digest: string;
  readonly freshness: "current" | "cached";
  readonly warning?: CatalogLoadWarning;
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
  readonly catalog: typeof CatalogService.Service;
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

export type CatalogLoaderShape = {
  readonly load: (input: {
    readonly sourceUrl: string;
    /** Application-owned authority. Never inferred from a downloaded catalogId. */
    readonly allowFinalizeScripts?: boolean;
  }) => Effect.Effect<LoadedCatalog, CatalogLoadFailure>;
  /**
   * Load every selected source, then compose them once. Any source without
   * usable data fails the whole selection.
   */
  readonly loadSources: (input: {
    readonly sources: CatalogSources;
    /** Application-owned URL for the reserved `official` source. */
    readonly officialUrl: string;
  }) => Effect.Effect<
    LoadedCatalogSet,
    CatalogLoadFailure | CatalogCompositionFailure
  >;
};

const failure = (
  reason: CatalogLoadReason,
  sourceUrl: string,
  message: string,
  cause?: unknown,
) => new CatalogLoadFailure({ reason, sourceUrl, message, cause });

const normalizedUrl = (sourceUrl: string) =>
  Effect.gen(function* () {
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
  CatalogLoaderShape
>()("CatalogLoader") {
  static readonly make = Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const cache = yield* CatalogCache;
    const crypto = yield* Digest.Digest;

    const digestBytes = Effect.fn("CatalogLoader.digest")(function* (
      bytes: Uint8Array,
    ) {
      return yield* crypto.digestHex(Digest.sha256, bytes);
    });

    const decodeBytes = Effect.fn("CatalogLoader.decode")(function* <A>(
      bytes: Uint8Array,
      sourceUrl: string,
      check: (
        document: CatalogDocument,
      ) => Effect.Effect<A, CatalogLoadFailure>,
    ) {
      const digest = yield* digestBytes(bytes);
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

    const readBounded = Effect.fn("CatalogLoader.readBounded")(function* (
      response: HttpClientResponse.HttpClientResponse,
      sourceUrl: string,
    ) {
      const chunks: Array<Uint8Array> = [];
      let size = 0;
      yield* response.stream.pipe(
        Stream.runForEach((chunk) =>
          Effect.gen(function* () {
            size += chunk.byteLength;
            if (size > maxBytes)
              return yield* failure(
                new CatalogContentTooLarge({ maxBytes }),
                sourceUrl,
                `Catalog from ${sourceUrl} exceeds 8 MiB.`,
              );
            chunks.push(chunk);
          }),
        ),
        Effect.mapError((error) =>
          error instanceof CatalogLoadFailure
            ? error
            : failure(
                new CatalogUnavailable(),
                sourceUrl,
                `Could not read catalog response from ${sourceUrl}.`,
                error,
              ),
        ),
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

    const loadDocument = Effect.fn("CatalogLoader.loadDocument")(function* <A>(
      inputUrl: string,
      check: (
        document: CatalogDocument,
      ) => Effect.Effect<A, CatalogLoadFailure>,
      /**
       * Hand the fetched entry back instead of caching it, for callers whose
       * validation finishes only after this document joins others.
       */
      deferPersistence = false,
    ) {
      const sourceUrl = yield* normalizedUrl(inputUrl);
      const startedAt = yield* Clock.currentTimeMillis;
      const cached = yield* cache.read(sourceUrl).pipe(
        Effect.flatMap((entry) =>
          entry === undefined || entry.sourceUrl !== sourceUrl
            ? Effect.as(Effect.void, undefined)
            : Effect.gen(function* () {
                const bytes = new Uint8Array(entry.bytes);
                const digest = yield* digestBytes(bytes);
                if (digest !== entry.digest) return undefined;
                const decoded = yield* decodeBytes(bytes, sourceUrl, check);
                return { entry: { ...entry, bytes }, ...decoded };
              }),
        ),
        Effect.timeout(timeoutMillis),
        Effect.orElseSucceed(() => undefined),
      );

      const deferred: { entry?: CatalogCacheEntry } = {};
      const persist = (entry: CatalogCacheEntry) =>
        deferPersistence
          ? Effect.sync(() => {
              deferred.entry = entry;
              return true;
            })
          : writeCache(entry);
      const persistenceWarning = (validatedAt: number) =>
        persistenceWarningFor(sourceUrl, validatedAt);

      const fetchCurrent = Effect.fn("CatalogLoader.fetchCurrent")(
        function* () {
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
                  ...(written
                    ? {}
                    : { warning: persistenceWarning(validatedAt) }),
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
              ...(written ? {} : { warning: persistenceWarning(validatedAt) }),
            };
          }
          return yield* failure(
            new CatalogUnavailable(),
            sourceUrl,
            `Catalog server returned no usable document at ${sourceUrl}.`,
          );
        },
      );

      const elapsed = (yield* Clock.currentTimeMillis) - startedAt;
      const remaining = timeoutMillis - elapsed;
      const current =
        remaining <= 0
          ? Effect.fail(
              failure(
                new CatalogTimedOut({ timeoutMillis }),
                sourceUrl,
                `Catalog load timed out after 15 seconds at ${sourceUrl}.`,
              ),
            )
          : fetchCurrent().pipe(
              Effect.timeout(remaining),
              Effect.mapError((error) =>
                error._tag === "TimeoutError"
                  ? failure(
                      new CatalogTimedOut({ timeoutMillis }),
                      sourceUrl,
                      `Catalog load timed out after 15 seconds at ${sourceUrl}.`,
                      error,
                    )
                  : error,
              ),
            );
      const loaded: LoadedDocument<A> =
        cached === undefined
          ? yield* current
          : yield* current.pipe(
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
      const result: LoadedDocument<A> = {
        ...loaded,
        ...(deferred.entry === undefined ? {} : { pending: deferred.entry }),
      };
      return result;
    });

    const load = Effect.fn("CatalogLoader.load")(function* ({
      sourceUrl,
      allowFinalizeScripts = false,
    }: Parameters<CatalogLoaderShape["load"]>[0]) {
      const { value, ...loaded } = yield* loadDocument(sourceUrl, (document) =>
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
    }: Parameters<CatalogLoaderShape["loadSources"]>[0]) {
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
      const loaded = results.flatMap((result) =>
        Result.isSuccess(result) ? [result.success] : [],
      );
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
      const loadedSources = yield* Effect.forEach(
        loaded,
        ({ source, pending }) =>
          pending === undefined
            ? Effect.succeed(source)
            : writeCache(pending).pipe(
                Effect.map((written) =>
                  written
                    ? source
                    : {
                        ...source,
                        warning: persistenceWarningFor(
                          source.sourceUrl,
                          pending.validatedAt,
                        ),
                      },
                ),
              ),
      );
      return { catalog, sources: loadedSources } satisfies LoadedCatalogSet;
    });

    return { load, loadSources } satisfies CatalogLoaderShape;
  });

  static readonly layer = Layer.effect(this, this.make);
}
