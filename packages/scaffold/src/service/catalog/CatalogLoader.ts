import { CatalogService, decodeCatalogDocument } from "@repo/catalog";
import {
  CatalogCapabilityError,
  type CatalogValidationError,
} from "@repo/domain/Catalog";
import {
  Clock,
  Context,
  Crypto,
  Data,
  Effect,
  Layer,
  Schema,
  Stream,
} from "effect";
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";
import { CatalogCache, type CatalogCacheEntry } from "./CatalogCache";

const maxBytes = 8 * 1024 * 1024;
const timeoutMillis = 15_000;

export type CatalogLoadReason =
  | "invalidSource"
  | "unavailable"
  | "timeout"
  | "httpStatus"
  | "invalidContentType"
  | "invalidJson"
  | "invalidCatalog"
  | "unsupportedFormat"
  | "unsupportedCapability"
  | "contentTooLarge";

export class CatalogLoadFailure extends Data.TaggedError("CatalogLoadFailure")<{
  readonly reason: CatalogLoadReason;
  readonly sourceUrl: string;
  readonly message: string;
  readonly status?: number;
}> {}

export interface CatalogLoadWarning {
  readonly kind: "stale" | "persistence";
  readonly sourceUrl: string;
  readonly lastValidatedAt: number;
  readonly message: string;
}

export interface LoadedCatalog {
  readonly catalog: typeof CatalogService.Service;
  readonly sourceUrl: string;
  readonly digest: string;
  readonly freshness: "current" | "cached";
  readonly warning?: CatalogLoadWarning;
}

export interface CatalogLoaderShape {
  readonly load: (input: {
    readonly sourceUrl: string;
    /** Application-owned authority. Never inferred from a downloaded catalogId. */
    readonly allowFinalizeScripts?: boolean;
  }) => Effect.Effect<LoadedCatalog, CatalogLoadFailure>;
}

const failure = (
  reason: CatalogLoadReason,
  sourceUrl: string,
  message: string,
  status?: number,
) =>
  new CatalogLoadFailure({
    reason,
    sourceUrl,
    message,
    ...(status === undefined ? {} : { status }),
  });

const normalizedUrl = (sourceUrl: string) =>
  Effect.try({
    try: () => {
      const url = new URL(sourceUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:")
        throw new Error("Catalog sources must use HTTP or HTTPS.");
      url.hash = "";
      return url.toString();
    },
    catch: () =>
      failure("invalidSource", sourceUrl, `Invalid catalog URL: ${sourceUrl}`),
  });

const isTransient = (error: CatalogLoadFailure) =>
  error.reason === "unavailable" || error.reason === "timeout";

export class CatalogLoader extends Context.Service<
  CatalogLoader,
  CatalogLoaderShape
>()("CatalogLoader") {
  static readonly make = Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const cache = yield* CatalogCache;
    const crypto = yield* Crypto.Crypto;

    const digestBytes = Effect.fn("CatalogLoader.digest")(function* (
      bytes: Uint8Array,
      sourceUrl: string,
    ) {
      const digest = yield* crypto
        .digest("SHA-256", bytes)
        .pipe(
          Effect.mapError(() =>
            failure(
              "unavailable",
              sourceUrl,
              `Could not hash catalog data from ${sourceUrl}.`,
            ),
          ),
        );
      return Array.from(digest, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    });

    const decodeBytes = Effect.fn("CatalogLoader.decode")(function* (
      bytes: Uint8Array,
      sourceUrl: string,
      allowFinalizeScripts: boolean,
    ) {
      const digest = yield* digestBytes(bytes, sourceUrl);
      const text = yield* Effect.try({
        try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        catch: () =>
          failure(
            "invalidJson",
            sourceUrl,
            `Catalog from ${sourceUrl} is not UTF-8.`,
          ),
      });
      const json = yield* Schema.decodeEffect(
        Schema.fromJsonString(Schema.Unknown),
      )(text).pipe(
        Effect.mapError(() =>
          failure(
            "invalidJson",
            sourceUrl,
            `Catalog from ${sourceUrl} is not valid JSON.`,
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
          "unsupportedFormat",
          sourceUrl,
          `Catalog from ${sourceUrl} uses an unsupported formatVersion.`,
        );
      const document = yield* decodeCatalogDocument(json).pipe(
        Effect.mapError((error) =>
          error instanceof CatalogCapabilityError
            ? failure("unsupportedCapability", sourceUrl, error.message)
            : failure(
                "invalidCatalog",
                sourceUrl,
                `Invalid catalog from ${sourceUrl}: ${error.message}`,
              ),
        ),
      );
      const catalog = yield* CatalogService.pipe(
        Effect.provide(
          CatalogService.fromFragments(
            [document],
            allowFinalizeScripts ? { trustedFragmentIndex: 0 } : {},
          ),
        ),
        Effect.mapError((error: CatalogValidationError) =>
          failure("invalidCatalog", sourceUrl, error.message),
        ),
      );
      return { catalog, digest };
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
                "contentTooLarge",
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
                "unavailable",
                sourceUrl,
                `Could not read catalog response from ${sourceUrl}.`,
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

    const load = Effect.fn("CatalogLoader.load")(function* ({
      sourceUrl: inputUrl,
      allowFinalizeScripts = false,
    }: Parameters<CatalogLoaderShape["load"]>[0]) {
      const sourceUrl = yield* normalizedUrl(inputUrl);
      const startedAt = yield* Clock.currentTimeMillis;
      const cached = yield* cache.read(sourceUrl).pipe(
        Effect.flatMap((entry) =>
          entry === undefined || entry.sourceUrl !== sourceUrl
            ? Effect.as(Effect.void, undefined)
            : Effect.gen(function* () {
                const bytes = new Uint8Array(entry.bytes);
                const digest = yield* digestBytes(bytes, sourceUrl);
                if (digest !== entry.digest) return undefined;
                const decoded = yield* decodeBytes(
                  bytes,
                  sourceUrl,
                  allowFinalizeScripts,
                );
                return { entry: { ...entry, bytes }, ...decoded };
              }),
        ),
        Effect.timeout(timeoutMillis),
        Effect.orElseSucceed(() => undefined),
      );

      const persist = (entry: CatalogCacheEntry) =>
        cache.write(entry).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        );
      const persistenceWarning = (validatedAt: number): CatalogLoadWarning => ({
        kind: "persistence",
        sourceUrl,
        lastValidatedAt: validatedAt,
        message: `Catalog from ${sourceUrl} is current, but it could not be cached.`,
      });

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
            const response = yield* client
              .execute(request)
              .pipe(
                Effect.mapError(() =>
                  failure(
                    "unavailable",
                    sourceUrl,
                    `Could not fetch catalog from ${sourceUrl}.`,
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
                  catalog: cached.catalog,
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
                "unavailable",
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
                "unavailable",
                sourceUrl,
                `Catalog server returned HTTP ${response.status} at ${sourceUrl}.`,
                response.status,
              );
            if (response.status !== 200)
              return yield* failure(
                "httpStatus",
                sourceUrl,
                `Catalog server returned HTTP ${response.status} at ${sourceUrl}.`,
                response.status,
              );
            const contentType = response.headers["content-type"] ?? "";
            if (
              !/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|\s*$)/i.test(
                contentType,
              )
            )
              return yield* failure(
                "invalidContentType",
                sourceUrl,
                `Catalog response from ${sourceUrl} is not JSON.`,
              );
            const bytes = yield* readBounded(response, sourceUrl);
            const decoded = yield* decodeBytes(
              bytes,
              sourceUrl,
              allowFinalizeScripts,
            );
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
              catalog: decoded.catalog,
              sourceUrl,
              digest: decoded.digest,
              freshness: "current" as const,
              ...(written ? {} : { warning: persistenceWarning(validatedAt) }),
            };
          }
          return yield* failure(
            "unavailable",
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
                "timeout",
                sourceUrl,
                `Catalog load timed out after 15 seconds at ${sourceUrl}.`,
              ),
            )
          : fetchCurrent().pipe(
              Effect.timeout(remaining),
              Effect.mapError((error) =>
                error._tag === "TimeoutError"
                  ? failure(
                      "timeout",
                      sourceUrl,
                      `Catalog load timed out after 15 seconds at ${sourceUrl}.`,
                    )
                  : error,
              ),
            );
      if (cached === undefined) return yield* current;
      const staleFallback = Effect.succeed({
        catalog: cached.catalog,
        sourceUrl,
        digest: cached.digest,
        freshness: "cached" as const,
        warning: {
          kind: "stale" as const,
          sourceUrl,
          lastValidatedAt: cached.entry.validatedAt,
          message: `Using cached catalog from ${sourceUrl}; last validated at ${cached.entry.validatedAt} ms since epoch.`,
        },
      });
      return yield* current.pipe(
        Effect.catchIf(isTransient, () => staleFallback),
      );
    });

    return { load } satisfies CatalogLoaderShape;
  });

  static readonly layer = Layer.effect(this, this.make);
}
