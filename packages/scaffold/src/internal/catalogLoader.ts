import { CatalogReader } from "@repo/catalog/Catalog";
import { decodeDocument } from "@repo/catalog/Protocol";
import {
  CatalogCapabilityError,
  type CatalogDocument,
  type CatalogSource,
  type CatalogValidationError,
  CatalogCacheEntry,
  CatalogCapabilityUnsupported,
  CatalogCompositionFailure,
  CatalogContentTooLarge,
  CatalogContentTypeInvalid,
  CatalogDocumentInvalid,
  CatalogFormatUnsupported,
  CatalogHttpStatusRejected,
  CatalogJsonInvalid,
  CatalogLoadFailure,
  type CatalogLoadReason,
  CatalogLoadWarning,
  LoadedCatalogSource,
  CatalogSourceInvalid,
  CatalogSourceUrl,
  CatalogTimedOut,
  CatalogUnavailable,
  selectsOfficialCatalog,
} from "@repo/domain/Catalog";
import { Clock, Data, Effect, Predicate, Result, Schema, Stream } from "effect";
import * as Digest from "effect/crypto/Digest";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import type { CatalogCache, CatalogLoader, LoadedCatalog } from "../Catalog";

const MIB = 1024 * 1024;
const MAX_CATALOG_BYTES = 8 * MIB;
const CATALOG_TIMEOUT_MILLIS = 15_000;

// Steps fail with the reason and message; `loadDocument` attaches the source once.
class LoadIssue extends Data.TaggedError("LoadIssue")<{
  reason: CatalogLoadReason;
  message: string;
  cause?: unknown;
}> {}

type DocumentRequest<A> = {
  sourceUrl: CatalogSourceUrl;
  check: (document: CatalogDocument) => Effect.Effect<A, LoadIssue>;
};

type CachedDocument<A> = { value: A; entry: CatalogCacheEntry };

// `current` holds the entry to cache once the caller accepts the document.
type DocumentFreshness = Data.TaggedEnum<{
  current: { entry: CatalogCacheEntry };
  cached: { entry: CatalogCacheEntry; warning: CatalogLoadWarning };
}>;

const DocumentFreshness = Data.taggedEnum<DocumentFreshness>();

const decodeSourceUrl = (sourceUrl: string) =>
  Schema.decodeEffect(CatalogSourceUrl)(sourceUrl).pipe(
    Effect.mapError(
      (cause) =>
        new CatalogLoadFailure({
          reason: new CatalogSourceInvalid(),
          sourceUrl,
          message: `Invalid catalog URL: ${sourceUrl}`,
          cause,
        }),
    ),
  );

const persistenceWarning = (entry: CatalogCacheEntry) =>
  CatalogLoadWarning.make({
    kind: "persistence",
    sourceUrl: entry.sourceUrl,
    lastValidatedAt: entry.validatedAt,
    message: `Catalog from ${entry.sourceUrl} is current, but it could not be cached.`,
  });

const describeLoad = (
  freshness: DocumentFreshness,
  warning: CatalogLoadWarning | undefined,
) => ({
  sourceUrl: freshness.entry.sourceUrl,
  digest: freshness.entry.digest,
  freshness: freshness._tag,
  warning,
});

const isTransient = (issue: LoadIssue) =>
  issue.reason._tag === "CatalogUnavailable" ||
  issue.reason._tag === "CatalogTimedOut";

const isRetryableStatus = (status: number) =>
  status === 408 || status === 429 || (status >= 500 && status < 600);

const JSON_CONTENT_TYPE = /^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|\s*$)/i;

/** @internal */
export const make = (cache: CatalogCache["Service"]) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const crypto = yield* Digest.Digest;

    const decodeBytes = Effect.fnUntraced(function* <A>(
      request: DocumentRequest<A>,
      bytes: Uint8Array,
    ) {
      const { sourceUrl } = request;
      const text = yield* Effect.try({
        try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        catch: (cause) =>
          new LoadIssue({
            reason: new CatalogJsonInvalid(),
            message: `Catalog from ${sourceUrl} is not UTF-8.`,
            cause,
          }),
      });
      const json = yield* Schema.decodeEffect(
        Schema.fromJsonString(Schema.Unknown),
      )(text).pipe(
        Effect.mapError(
          (cause) =>
            new LoadIssue({
              reason: new CatalogJsonInvalid(),
              message: `Catalog from ${sourceUrl} is not valid JSON.`,
              cause,
            }),
        ),
      );
      if (
        Predicate.hasProperty(json, "formatVersion") &&
        json.formatVersion !== 1
      )
        return yield* new LoadIssue({
          reason: new CatalogFormatUnsupported(),
          message: `Catalog from ${sourceUrl} uses an unsupported formatVersion.`,
        });
      const document = yield* decodeDocument(json).pipe(
        Effect.mapError((error) =>
          error instanceof CatalogCapabilityError
            ? new LoadIssue({
                reason: new CatalogCapabilityUnsupported(),
                message: error.message,
                cause: error,
              })
            : new LoadIssue({
                reason: new CatalogDocumentInvalid(),
                message: `Invalid catalog from ${sourceUrl}: ${error.message}`,
                cause: error,
              }),
        ),
      );
      return yield* request.check(document);
    });

    const readBounded = Effect.fnUntraced(function* (
      sourceUrl: CatalogSourceUrl,
      response: HttpClientResponse.HttpClientResponse,
    ) {
      // A running size bounds the read before the whole body is buffered.
      const chunks: Array<Uint8Array> = [];
      let size = 0;
      const accept = Effect.fnUntraced(function* (chunk: Uint8Array) {
        size += chunk.byteLength;
        if (size > MAX_CATALOG_BYTES)
          return yield* new LoadIssue({
            reason: new CatalogContentTooLarge({ maxBytes: MAX_CATALOG_BYTES }),
            message: `Catalog from ${sourceUrl} exceeds ${MAX_CATALOG_BYTES / MIB} MiB.`,
          });
        chunks.push(chunk);
      });

      yield* response.stream.pipe(
        Stream.mapError(
          (error) =>
            new LoadIssue({
              reason: new CatalogUnavailable(),
              message: `Could not read catalog response from ${sourceUrl}.`,
              cause: error,
            }),
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

    const readCached = Effect.fnUntraced(function* <A>(
      request: DocumentRequest<A>,
    ) {
      const entry = yield* cache.read(request.sourceUrl);
      if (entry === undefined || entry.sourceUrl !== request.sourceUrl)
        return undefined;
      const bytes = new Uint8Array(entry.bytes);
      const digest = yield* crypto.digestHex(Digest.sha256, bytes);
      if (digest !== entry.digest) return undefined;
      const value = yield* decodeBytes(request, bytes);
      return { value, entry: { ...entry, bytes } };
    });

    const execute = (
      sourceUrl: CatalogSourceUrl,
      validators: CatalogCacheEntry | undefined,
    ) =>
      client
        .execute(
          HttpClientRequest.get(sourceUrl).pipe(
            HttpClientRequest.setHeaders({
              accept: "application/json",
              ...(validators?.etag ? { "if-none-match": validators.etag } : {}),
              ...(validators?.lastModified
                ? { "if-modified-since": validators.lastModified }
                : {}),
            }),
          ),
        )
        .pipe(
          // Trace headers are not CORS-safelisted, so a browser would
          // preflight every catalog fetch, and hosts need not allow them.
          Effect.provideService(HttpClient.TracerPropagationEnabled, false),
          Effect.mapError(
            (cause) =>
              new LoadIssue({
                reason: new CatalogUnavailable(),
                message: `Could not fetch catalog from ${sourceUrl}.`,
                cause,
              }),
          ),
        );

    const readCurrent = Effect.fnUntraced(function* <A>(
      request: DocumentRequest<A>,
      response: HttpClientResponse.HttpClientResponse,
    ) {
      const { sourceUrl } = request;
      if (isRetryableStatus(response.status))
        return yield* new LoadIssue({
          reason: new CatalogUnavailable({ status: response.status }),
          message: `Catalog server returned HTTP ${response.status} at ${sourceUrl}.`,
        });
      if (response.status !== 200)
        return yield* new LoadIssue({
          reason: new CatalogHttpStatusRejected({ status: response.status }),
          message: `Catalog server returned HTTP ${response.status} at ${sourceUrl}.`,
        });
      const contentType = response.headers["content-type"] ?? "";
      if (!JSON_CONTENT_TYPE.test(contentType))
        return yield* new LoadIssue({
          reason: new CatalogContentTypeInvalid({ contentType }),
          message: `Catalog response from ${sourceUrl} is not JSON.`,
        });

      const bytes = yield* readBounded(sourceUrl, response);
      const digest = yield* crypto.digestHex(Digest.sha256, bytes);
      const value = yield* decodeBytes(request, bytes);
      const validatedAt = yield* Clock.currentTimeMillis;
      const entry = CatalogCacheEntry.make({
        sourceUrl,
        bytes,
        digest,
        validatedAt,
        ...(response.headers["etag"] ? { etag: response.headers["etag"] } : {}),
        ...(response.headers["last-modified"]
          ? { lastModified: response.headers["last-modified"] }
          : {}),
      });
      return { value, freshness: DocumentFreshness.current({ entry }) };
    });

    const fetchCurrent = Effect.fnUntraced(function* <A>(
      request: DocumentRequest<A>,
      cached: CachedDocument<A> | undefined,
    ) {
      const response = yield* execute(request.sourceUrl, cached?.entry);
      if (response.status !== 304) return yield* readCurrent(request, response);
      if (cached !== undefined) {
        const validatedAt = yield* Clock.currentTimeMillis;
        return {
          value: cached.value,
          freshness: DocumentFreshness.current({
            entry: { ...cached.entry, validatedAt },
          }),
        };
      }

      // A 304 to a request without validators has nothing to revalidate; ask once more.
      const retried = yield* execute(request.sourceUrl, undefined);
      if (retried.status === 304)
        return yield* new LoadIssue({
          reason: new CatalogUnavailable(),
          message: `Catalog server returned 304 without usable cached data at ${request.sourceUrl}.`,
        });
      return yield* readCurrent(request, retried);
    });

    // Callers persist a `current` document once they accept it, so a selection
    // that fails to compose never replaces a source's last validated entry.
    const loadDocument = <A>(request: DocumentRequest<A>) =>
      Effect.gen(function* () {
        const { sourceUrl } = request;
        const startedAt = yield* Clock.currentTimeMillis;
        const cached = yield* readCached(request).pipe(
          Effect.timeout(CATALOG_TIMEOUT_MILLIS),
          Effect.orElseSucceed(() => undefined),
        );

        const remaining =
          CATALOG_TIMEOUT_MILLIS -
          ((yield* Clock.currentTimeMillis) - startedAt);
        const timedOut = Effect.fail(
          new LoadIssue({
            reason: new CatalogTimedOut({
              timeoutMillis: CATALOG_TIMEOUT_MILLIS,
            }),
            message: `Catalog load timed out after ${CATALOG_TIMEOUT_MILLIS / 1000} seconds at ${sourceUrl}.`,
          }),
        );
        const current =
          remaining <= 0
            ? timedOut
            : fetchCurrent(request, cached).pipe(
                Effect.timeoutOrElse({
                  duration: remaining,
                  orElse: () => timedOut,
                }),
              );
        if (cached === undefined) return yield* current;

        return yield* current.pipe(
          Effect.catchIf(isTransient, () =>
            Effect.succeed({
              value: cached.value,
              freshness: DocumentFreshness.cached({
                entry: cached.entry,
                warning: CatalogLoadWarning.make({
                  kind: "stale",
                  sourceUrl,
                  lastValidatedAt: cached.entry.validatedAt,
                  message: `Using cached catalog from ${sourceUrl}; last validated at ${cached.entry.validatedAt} ms since epoch.`,
                }),
              }),
            }),
          ),
        );
      }).pipe(
        Effect.mapError(
          (issue) =>
            new CatalogLoadFailure({
              reason: issue.reason,
              sourceUrl: request.sourceUrl,
              message: issue.message,
              cause: issue.cause,
            }),
        ),
      );

    const persist = (freshness: DocumentFreshness) =>
      DocumentFreshness.$match(freshness, {
        current: ({ entry }) =>
          cache.write(entry).pipe(
            Effect.as(undefined),
            Effect.orElseSucceed(() => persistenceWarning(entry)),
          ),
        cached: ({ warning }) => Effect.succeed(warning),
      }).pipe(Effect.map((warning) => describeLoad(freshness, warning)));

    const loadSource = Effect.fnUntraced(
      function* (source: CatalogSource, officialUrl: string) {
        const sourceUrl =
          "url" in source ? source.url : yield* decodeSourceUrl(officialUrl);
        const { value: document, freshness } = yield* loadDocument({
          sourceUrl,
          check: (document: CatalogDocument) => Effect.succeed(document),
        });
        const staleWarning = DocumentFreshness.$is("cached")(freshness)
          ? freshness.warning
          : undefined;
        return {
          document,
          freshness,
          source: LoadedCatalogSource.make({
            name: source.name,
            requires: document.requires ?? [],
            ...describeLoad(freshness, staleWarning),
          }),
        };
      },
      (effect, source) =>
        effect.pipe(
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
        ),
    );

    const load = Effect.fn("CatalogLoader.load")(function* ({
      sourceUrl,
      allowFinalizeScripts = false,
    }: Parameters<CatalogLoader["Service"]["load"]>[0]): Effect.fn.Return<
      LoadedCatalog,
      CatalogLoadFailure
    > {
      const url = yield* decodeSourceUrl(sourceUrl);
      const { value, freshness } = yield* loadDocument({
        sourceUrl: url,
        check: (document) =>
          CatalogReader.pipe(
            Effect.provide(
              CatalogReader.fromFragments(
                [document],
                allowFinalizeScripts ? { trustedFragmentIndex: 0 } : {},
              ),
            ),
            Effect.mapError(
              (error: CatalogValidationError) =>
                new LoadIssue({
                  reason: new CatalogDocumentInvalid(),
                  message: error.message,
                  cause: error,
                }),
            ),
          ),
      });
      return { catalog: value, ...(yield* persist(freshness)) };
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
        (source) => Effect.result(loadSource(source, officialUrl)),
        { concurrency: "unbounded" },
      );
      // Report the first failure in selection order, however the fetches raced.
      const failed = results.find(Result.isFailure);
      if (failed !== undefined) return yield* failed.failure;
      const loaded = results
        .filter(Result.isSuccess)
        .map((result) => result.success);

      const catalog = yield* CatalogReader.pipe(
        Effect.provide(
          CatalogReader.fromFragments(
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
              sources: loaded.map(({ source }) => source),
              cause: error,
            }),
        ),
      );

      const persisted = yield* Effect.forEach(loaded, ({ source, freshness }) =>
        persist(freshness).pipe(
          Effect.map((loadedSource) =>
            LoadedCatalogSource.make({ ...source, ...loadedSource }),
          ),
        ),
      );
      return { catalog, sources: persisted };
    });

    return { load, loadSources };
  });
