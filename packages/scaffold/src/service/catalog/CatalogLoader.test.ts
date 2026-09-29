import { BrowserCrypto } from "@effect/platform-browser";
import { assert, describe, it } from "@effect/vitest";
import { exportOfficialCatalog } from "@repo/catalog-official/service";
import { CatalogDocument, ModuleId, TargetKind } from "@repo/domain/Catalog";
import { Deferred, Effect, Fiber, Layer, Schema } from "effect";
import { TestClock } from "effect/testing";
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";
import { CatalogLoader as BrowserCatalogLoader } from "../../browser";
import {
  CatalogCache,
  CatalogCacheFailure,
  type CatalogCacheEntry,
} from "./CatalogCache";
import { CatalogLoader, type CatalogLoadReason } from "./CatalogLoader";

const sourceUrl = "https://catalog.example.test/catalog.json";
const document = Schema.encodeSync(Schema.fromJsonString(CatalogDocument))({
  formatVersion: 1,
  catalogId: Schema.NonEmptyString.make("fixture"),
  requiredCapabilities: [],
  targets: [],
  modules: [],
});

const response = (
  request: HttpClientRequest.HttpClientRequest,
  status: number,
  body: string | null = null,
  headers: HeadersInit = {},
) => {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has("content-type"))
    responseHeaders.set("content-type", "application/json");
  return HttpClientResponse.fromWeb(
    request,
    new Response(body, {
      status,
      headers: responseHeaders,
    }),
  );
};

type Handler = (
  request: HttpClientRequest.HttpClientRequest,
) => HttpClientResponse.HttpClientResponse;

/** A loader over a synchronous request handler, or over a whole HTTP client. */
const testLayer = (
  http: Handler | HttpClient.HttpClient,
  cache = CatalogCache.memory,
) =>
  CatalogLoader.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.isHttpClient(http)
            ? http
            : HttpClient.make((request) => Effect.sync(() => http(request))),
        ),
        cache,
        BrowserCrypto.layer,
      ),
    ),
  );

const encode = Schema.encodeSync(Schema.fromJsonString(CatalogDocument));

interface RejectionCase {
  readonly reason: CatalogLoadReason;
  readonly condition: string;
  readonly respond: Handler;
}

const rejections: ReadonlyArray<RejectionCase> = [
  {
    reason: "invalidJson",
    condition: "is not valid JSON",
    respond: (request) => response(request, 200, "{"),
  },
  {
    reason: "unsupportedFormat",
    condition: "declares an unsupported format version",
    respond: (request) => response(request, 200, '{"formatVersion":2}'),
  },
  {
    reason: "unsupportedCapability",
    condition: "requires a capability the v1 interpreter cannot execute",
    respond: (request) =>
      response(
        request,
        200,
        encode({
          formatVersion: 1,
          catalogId: Schema.NonEmptyString.make("future"),
          requiredCapabilities: ["token:future"],
          targets: [],
          modules: [],
        }),
      ),
  },
  {
    reason: "invalidCatalog",
    condition: "is structurally valid but has unresolved references",
    respond: (request) =>
      response(
        request,
        200,
        encode({
          formatVersion: 1,
          catalogId: Schema.NonEmptyString.make("broken"),
          requiredCapabilities: [],
          targets: [],
          modules: [
            {
              id: ModuleId.make("missing-target-module"),
              title: "Missing target",
              description: "The workspace target is absent",
              supportedOn: [
                { _tag: "kind", kind: TargetKind.make("workspace") },
              ],
              dependencies: [],
              contributions: [],
            },
          ],
        }),
      ),
  },
  {
    reason: "invalidContentType",
    condition: "is not labeled JSON",
    respond: (request) =>
      response(request, 200, document, { "content-type": "text/html" }),
  },
];

describe("CatalogLoader entry points", () => {
  it("should export the same loader from the browser entry", () => {
    assert.strictEqual(BrowserCatalogLoader, CatalogLoader);
  });
});

it.effect(
  "should revalidate the kept response with its ETag when the source is loaded again",
  () => {
    const requests: Array<HttpClientRequest.HttpClientRequest> = [];
    const layer = testLayer((request) => {
      requests.push(request);
      return requests.length === 1
        ? response(request, 200, document, { etag: '"v1"' })
        : response(request, 304);
    });
    return Effect.gen(function* () {
      const loader = yield* CatalogLoader;
      const first = yield* loader.load({ sourceUrl });
      const second = yield* loader.load({ sourceUrl });
      assert.strictEqual(first.freshness, "current");
      assert.strictEqual(second.freshness, "current");
      assert.strictEqual(first.digest, second.digest);
      assert.strictEqual(requests[1]?.headers["if-none-match"], '"v1"');
    }).pipe(Effect.provide(layer));
  },
);

it.effect(
  "should send only the accept header when fetching a catalog so no CORS preflight is needed",
  () => {
    const requests: Array<HttpClientRequest.HttpClientRequest> = [];
    const layer = testLayer((request) => {
      requests.push(request);
      return response(request, 200, document);
    });
    return Effect.gen(function* () {
      const loader = yield* CatalogLoader;
      yield* loader.load({ sourceUrl });
      assert.deepStrictEqual(Object.keys(requests[0]?.headers ?? {}), [
        "accept",
      ]);
    }).pipe(Effect.provide(layer));
  },
);

it.effect(
  "should return a stale-labeled cached catalog when the server fails transiently",
  () => {
    let calls = 0;
    const layer = testLayer((request) => {
      calls++;
      return calls === 1
        ? response(request, 200, document)
        : response(request, 503);
    });
    return Effect.gen(function* () {
      const loader = yield* CatalogLoader;
      yield* TestClock.setTime(1_000);
      yield* loader.load({ sourceUrl });
      yield* TestClock.setTime(2_000);
      const stale = yield* loader.load({ sourceUrl });
      assert.strictEqual(stale.freshness, "cached");
      assert.isDefined(stale.warning);
      assert.strictEqual(stale.warning.kind, "stale");
      assert.strictEqual(stale.warning.lastValidatedAt, 1_000);
      assert.strictEqual(calls, 2);
    }).pipe(Effect.provide(layer));
  },
);

it.effect(
  "should change only the later loaded catalog when a later response differs",
  () => {
    const changed = Schema.encodeSync(Schema.fromJsonString(CatalogDocument))({
      formatVersion: 1,
      catalogId: Schema.NonEmptyString.make("fixture"),
      requiredCapabilities: [],
      targets: [
        {
          kind: TargetKind.make("workspace"),
          title: "Workspace",
          description: "A later definition",
          contributions: [],
        },
      ],
      modules: [],
    });
    let calls = 0;
    const layer = testLayer((request) =>
      response(request, 200, ++calls === 1 ? document : changed),
    );
    return Effect.gen(function* () {
      const loader = yield* CatalogLoader;
      const first = yield* loader.load({ sourceUrl });
      const second = yield* loader.load({ sourceUrl });
      assert.strictEqual(first.catalog.toCatalogTree.targets.length, 0);
      assert.strictEqual(second.catalog.toCatalogTree.targets.length, 1);
      assert.notStrictEqual(first.digest, second.digest);
    }).pipe(Effect.provide(layer));
  },
);

it.effect(
  "should load the complete official export when it passes strict wire validation",
  () =>
    Effect.gen(function* () {
      const official = yield* exportOfficialCatalog;
      const loaded = yield* Effect.gen(function* () {
        return yield* (yield* CatalogLoader).load({
          sourceUrl,
          allowFinalizeScripts: true,
        });
      }).pipe(
        Effect.provide(
          testLayer((request) => response(request, 200, official)),
        ),
      );
      assert.isAbove(loaded.catalog.toCatalogTree.targets.length, 0);
      assert.strictEqual(loaded.freshness, "current");
    }),
);

it.effect(
  "should fail with httpStatus instead of using the cache when the response is permanent",
  () => {
    let calls = 0;
    const layer = testLayer((request) => {
      calls++;
      return calls === 1
        ? response(request, 200, document)
        : response(request, 404);
    });
    return Effect.gen(function* () {
      const loader = yield* CatalogLoader;
      yield* loader.load({ sourceUrl });
      const error = yield* Effect.flip(loader.load({ sourceUrl }));
      assert.strictEqual(error.reason, "httpStatus");
      assert.strictEqual(error.status, 404);
    }).pipe(Effect.provide(layer));
  },
);

it.effect(
  "should retry without validators when a 304 arrives without usable cached data",
  () => {
    const requests: Array<HttpClientRequest.HttpClientRequest> = [];
    const layer = testLayer((request) => {
      requests.push(request);
      return requests.length === 1
        ? response(request, 304)
        : response(request, 200, document);
    });
    return Effect.gen(function* () {
      const loaded = yield* (yield* CatalogLoader).load({ sourceUrl });
      assert.strictEqual(loaded.freshness, "current");
      assert.strictEqual(requests.length, 2);
      assert.isUndefined(requests[1]?.headers["if-none-match"]);
    }).pipe(Effect.provide(layer));
  },
);

it.effect(
  "should warn about persistence when validated content cannot be cached",
  () => {
    const cache = Layer.succeed(CatalogCache, {
      read: () => Effect.as(Effect.void, undefined),
      write: (_entry: CatalogCacheEntry) =>
        Effect.fail(new CatalogCacheFailure({ message: "storage full" })),
    });
    return Effect.gen(function* () {
      const loaded = yield* (yield* CatalogLoader).load({ sourceUrl });
      assert.strictEqual(loaded.freshness, "current");
      assert.strictEqual(loaded.warning?.kind, "persistence");
    }).pipe(
      Effect.provide(
        testLayer((request) => response(request, 200, document), cache),
      ),
    );
  },
);

it.effect("should fetch current data when the cache cannot be read", () => {
  const cache = Layer.succeed(CatalogCache, {
    read: () =>
      Effect.fail(new CatalogCacheFailure({ message: "unavailable" })),
    write: (_entry: CatalogCacheEntry) => Effect.void,
  });
  return Effect.gen(function* () {
    const loaded = yield* (yield* CatalogLoader).load({ sourceUrl });
    assert.strictEqual(loaded.freshness, "current");
  }).pipe(
    Effect.provide(
      testLayer((request) => response(request, 200, document), cache),
    ),
  );
});

it.effect(
  "should ignore a cached entry when its bytes do not match its digest",
  () => {
    const requests: Array<HttpClientRequest.HttpClientRequest> = [];
    const cache = Layer.succeed(CatalogCache, {
      read: () =>
        Effect.succeed({
          sourceUrl,
          bytes: new TextEncoder().encode(document),
          digest: "incorrect",
          etag: '"old"',
          validatedAt: 1,
        }),
      write: (_entry: CatalogCacheEntry) => Effect.void,
    });
    return Effect.gen(function* () {
      const loaded = yield* (yield* CatalogLoader).load({ sourceUrl });
      assert.strictEqual(loaded.freshness, "current");
      assert.isUndefined(requests[0]?.headers["if-none-match"]);
    }).pipe(
      Effect.provide(
        testLayer((request) => {
          requests.push(request);
          return response(request, 200, document);
        }, cache),
      ),
    );
  },
);

it.effect.each(rejections)(
  "should fail with $reason when the response $condition",
  ({ reason, respond }) =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        (yield* CatalogLoader).load({ sourceUrl }),
      );
      assert.strictEqual(error.reason, reason);
    }).pipe(Effect.provide(testLayer(respond))),
);

it.effect(
  "should fail with contentTooLarge and release the stream when the body exceeds 8 MiB",
  () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
      },
      cancel() {
        canceled = true;
      },
    });
    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        (yield* CatalogLoader).load({ sourceUrl }),
      );
      assert.strictEqual(error.reason, "contentTooLarge");
      assert.isTrue(canceled);
    }).pipe(
      Effect.provide(
        testLayer((request) =>
          HttpClientResponse.fromWeb(
            request,
            new Response(body, {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          ),
        ),
      ),
    );
  },
);

it.effect(
  "should fail with timeout and stop the request when it hangs past 15 seconds",
  () => {
    let started = false;
    let stopped = false;
    const layer = testLayer(
      HttpClient.make(() =>
        Effect.sync(() => {
          started = true;
        }).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(
            Effect.sync(() => {
              stopped = true;
            }),
          ),
        ),
      ),
    );
    return Effect.gen(function* () {
      const loader = yield* CatalogLoader;
      const fiber = yield* Effect.forkChild(loader.load({ sourceUrl }));
      yield* TestClock.adjust("15 seconds");
      const error = yield* Effect.flip(Fiber.join(fiber));
      assert.strictEqual(error.reason, "timeout");
      assert.isTrue(started);
      assert.isTrue(stopped);
    }).pipe(Effect.provide(layer));
  },
);

it.effect(
  "should cancel the in-flight HTTP request when its caller is interrupted",
  () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      let stopped = false;
      const client = HttpClient.make(() =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(
            Effect.sync(() => {
              stopped = true;
            }),
          ),
        ),
      );
      const layer = testLayer(client);
      const fiber = yield* Effect.forkChild(
        Effect.gen(function* () {
          return yield* (yield* CatalogLoader).load({ sourceUrl });
        }).pipe(Effect.provide(layer)),
        { startImmediately: true },
      );
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      assert.isTrue(stopped);
    }),
);
