import { BrowserCrypto } from "@effect/platform-browser";
import { assert, it } from "@effect/vitest";
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
import { CatalogLoader } from "./CatalogLoader";

const sourceUrl = "https://catalog.example.test/catalog.json";
assert.strictEqual(BrowserCatalogLoader, CatalogLoader);
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

const testLayer = (
  handle: (
    request: HttpClientRequest.HttpClientRequest,
  ) => HttpClientResponse.HttpClientResponse,
  cache = CatalogCache.memory,
) =>
  CatalogLoader.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) => Effect.sync(() => handle(request))),
        ),
        cache,
        BrowserCrypto.layer,
      ),
    ),
  );

it.effect("keeps a validated response and revalidates it with ETag", () => {
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
});

it.effect("sends no trace headers that would need a CORS preflight", () => {
  const requests: Array<HttpClientRequest.HttpClientRequest> = [];
  const layer = testLayer((request) => {
    requests.push(request);
    return response(request, 200, document);
  });
  return Effect.gen(function* () {
    const loader = yield* CatalogLoader;
    yield* loader.load({ sourceUrl });
    assert.deepStrictEqual(Object.keys(requests[0]?.headers ?? {}), ["accept"]);
  }).pipe(Effect.provide(layer));
});

it.effect(
  "returns a labeled stale catalog for a transient server failure",
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

it.effect("a later response changes only the later loaded catalog", () => {
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
});

it.effect(
  "loads the complete official export through strict wire validation",
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

it.effect("does not fall back to cache for a permanent response", () => {
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
});

it.effect("retries a 304 without usable cached data without validators", () => {
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
});

it.effect("warns when validated content cannot be persisted", () => {
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
});

it.effect("fetches current data when the cache cannot be read", () => {
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

it.effect("ignores an entry whose bytes do not match its digest", () => {
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
});

it.effect("rejects invalid JSON and content type as permanent failures", () =>
  Effect.gen(function* () {
    const loader = yield* CatalogLoader;
    const error = yield* Effect.flip(loader.load({ sourceUrl }));
    assert.strictEqual(error.reason, "invalidJson");
  }).pipe(Effect.provide(testLayer((request) => response(request, 200, "{")))),
);

it.effect("rejects an unsupported format before composing definitions", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(
      (yield* CatalogLoader).load({ sourceUrl }),
    );
    assert.strictEqual(error.reason, "unsupportedFormat");
  }).pipe(
    Effect.provide(
      testLayer((request) => response(request, 200, '{"formatVersion":2}')),
    ),
  ),
);

it.effect("rejects a capability the v1 interpreter cannot execute", () => {
  const unsupported = Schema.encodeSync(Schema.fromJsonString(CatalogDocument))(
    {
      formatVersion: 1,
      catalogId: Schema.NonEmptyString.make("future"),
      requiredCapabilities: ["token:future"],
      targets: [],
      modules: [],
    },
  );
  return Effect.gen(function* () {
    const error = yield* Effect.flip(
      (yield* CatalogLoader).load({ sourceUrl }),
    );
    assert.strictEqual(error.reason, "unsupportedCapability");
  }).pipe(
    Effect.provide(testLayer((request) => response(request, 200, unsupported))),
  );
});

it.effect(
  "rejects a structurally valid source with unresolved references",
  () => {
    const invalid = Schema.encodeSync(Schema.fromJsonString(CatalogDocument))({
      formatVersion: 1,
      catalogId: Schema.NonEmptyString.make("broken"),
      requiredCapabilities: [],
      targets: [],
      modules: [
        {
          id: ModuleId.make("missing-target-module"),
          title: "Missing target",
          description: "The workspace target is absent",
          supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
          dependencies: [],
          contributions: [],
        },
      ],
    });
    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        (yield* CatalogLoader).load({ sourceUrl }),
      );
      assert.strictEqual(error.reason, "invalidCatalog");
      assert.match(error.message, /missing target workspace/);
    }).pipe(
      Effect.provide(testLayer((request) => response(request, 200, invalid))),
    );
  },
);

it.effect("rejects a response that is not labeled JSON", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(
      (yield* CatalogLoader).load({ sourceUrl }),
    );
    assert.strictEqual(error.reason, "invalidContentType");
  }).pipe(
    Effect.provide(
      testLayer((request) =>
        response(request, 200, document, { "content-type": "text/html" }),
      ),
    ),
  ),
);

it.effect("stops reading above 8 MiB and releases the response stream", () => {
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
});

it.effect("bounds a hanging request by the total 15 second deadline", () => {
  let started = false;
  let stopped = false;
  const layer = CatalogLoader.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(
          HttpClient.HttpClient,
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
        ),
        CatalogCache.memory,
        BrowserCrypto.layer,
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
});

it.effect("cancels an in-flight HTTP request with its caller", () =>
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
    const layer = CatalogLoader.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(HttpClient.HttpClient, client),
          CatalogCache.memory,
          BrowserCrypto.layer,
        ),
      ),
    );
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
