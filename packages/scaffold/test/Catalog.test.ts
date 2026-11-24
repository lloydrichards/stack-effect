import { BrowserCrypto } from "@effect/platform-browser";
import { assert, describe, it } from "@effect/vitest";
import { exportOfficialCatalog } from "@repo/catalog-official/service";
import {
  type CatalogCacheEntry,
  CatalogCacheFailure,
  CatalogCompositionFailure,
  CatalogDocument,
  CatalogHttpStatusRejected,
  CatalogLoadFailure,
  type CatalogLoadReason,
  type CatalogSources,
  ModuleId,
  TargetKind,
} from "@repo/domain/Catalog";
import { CatalogCache, CatalogLoader } from "@repo/scaffold/Catalog";
import { Deferred, Effect, Fiber, Layer, Option, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { TestClock } from "effect/testing";
import {
  json,
  loadSources,
  module,
  officialUrl,
  type Route,
  routedLayer,
  select,
  target,
  urls,
} from "./fixtures/scaffold";

describe("CatalogLoader", () => {
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
    cache = CatalogCache.layerMemory,
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

  type RejectionCase = {
    readonly reason: CatalogLoadReason["_tag"];
    readonly condition: string;
    readonly respond: Handler;
    readonly detail?: string;
  };

  const rejections: ReadonlyArray<RejectionCase> = [
    {
      reason: "CatalogJsonInvalid",
      condition: "is not valid JSON",
      respond: (request) => response(request, 200, "{"),
    },
    {
      reason: "CatalogFormatUnsupported",
      condition: "declares an unsupported format version",
      respond: (request) => response(request, 200, '{"formatVersion":2}'),
    },
    {
      reason: "CatalogCapabilityUnsupported",
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
      reason: "CatalogDocumentInvalid",
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
      reason: "CatalogCapabilityUnsupported",
      condition: "requires the retired barrel-export contribution",
      respond: (request) =>
        response(
          request,
          200,
          encode({
            formatVersion: 1,
            catalogId: Schema.NonEmptyString.make("legacy"),
            requiredCapabilities: ["contribution:barrel-export"],
            targets: [],
            modules: [],
          }),
        ),
    },
    {
      reason: "CatalogDocumentInvalid",
      condition: "contains a retired barrel-export contribution",
      detail: `["modules"][0]["contributions"][0]`,
      respond: (request) =>
        response(
          request,
          200,
          JSON.stringify({
            formatVersion: 1,
            catalogId: "legacy",
            requiredCapabilities: ["contribution:barrel-export"],
            targets: [],
            modules: [
              {
                id: "legacy-barrel",
                title: "Legacy barrel",
                description: "Re-exports a module from src/index.ts",
                supportedOn: [{ _tag: "kind", kind: "package" }],
                dependencies: [],
                contributions: [
                  {
                    _tag: "barrel-export",
                    barrelPath: "{{targetPath}}/src/index.ts",
                    exportPath: "./Api",
                  },
                ],
              },
            ],
          }),
        ),
    },
    {
      reason: "CatalogContentTypeInvalid",
      condition: "is not labeled JSON",
      respond: (request) =>
        response(request, 200, document, { "content-type": "text/html" }),
    },
  ];

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
      const changed = Schema.encodeSync(Schema.fromJsonString(CatalogDocument))(
        {
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
        },
      );
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
        assert.instanceOf(error.reason, CatalogHttpStatusRejected);
        assert.strictEqual(error.reason.status, 404);
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
    ({ reason, respond, detail }) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          (yield* CatalogLoader).load({ sourceUrl }),
        );
        assert.strictEqual(error.reason._tag, reason);
        if (detail !== undefined) assert.include(error.message, detail);
      }).pipe(Effect.provide(testLayer(respond))),
  );

  it.effect(
    "should fail with CatalogContentTooLarge and release the stream when the body exceeds 8 MiB",
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
        assert.strictEqual(error.reason._tag, "CatalogContentTooLarge");
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
    "should fail with CatalogTimedOut and stop the request when it hangs past 15 seconds",
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
        assert.strictEqual(error.reason._tag, "CatalogTimedOut");
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

  describe("sources", () => {
    const official = json("official", {
      targets: [target("workspace"), target("server")],
    });
    /** Contributes to the official server target and declares that dependency. */
    const ext = json("ext", {
      requires: ["official"],
      modules: [module("ext-auth", "server")],
    });
    /** A standalone catalog with its own workspace. */
    const acme = json("acme", {
      targets: [target("workspace"), target("api")],
      modules: [
        module("acme-api-rest", "api", {
          scripts: [
            {
              label: "Generate client",
              command: "bun run generate",
              phase: "finalize",
            },
          ],
        }),
      ],
    });
    const beta = json("beta", { targets: [target("worker")] });

    const kinds = (catalog: {
      readonly toCatalogTree: {
        readonly targets: ReadonlyArray<{ kind: string }>;
      };
    }) => catalog.toCatalogTree.targets.map((entry) => entry.kind);

    type SourceFailureCase = {
      readonly reason: CatalogLoadReason["_tag"];
      readonly sourceName: keyof typeof urls;
      readonly condition: string;
      readonly routes: Record<string, () => Route>;
      readonly selection: CatalogSources;
      readonly status?: number;
    };

    const sourceFailures: ReadonlyArray<SourceFailureCase> = [
      {
        reason: "CatalogJsonInvalid",
        sourceName: "acme",
        condition: "a selected source returns malformed JSON",
        routes: { [officialUrl]: () => official, [urls.acme]: () => "{" },
        selection: select("official", "acme"),
      },
      {
        reason: "CatalogDocumentInvalid",
        sourceName: "beta",
        condition: "a document requires a source other than official",
        routes: {
          [urls.beta]: () =>
            beta.replace(
              '"formatVersion":1',
              '"formatVersion":1,"requires":["acme"]',
            ),
        },
        selection: select("beta"),
      },
      {
        reason: "CatalogUnavailable",
        sourceName: "beta",
        condition: "one source has no usable data",
        routes: { [urls.acme]: () => acme, [urls.beta]: () => 503 },
        selection: select("acme", "beta"),
        status: 503,
      },
      {
        reason: "CatalogHttpStatusRejected",
        sourceName: "acme",
        condition: "a source answers with a permanent HTTP status",
        routes: { [urls.acme]: () => 410 },
        selection: select("acme"),
        status: 410,
      },
    ];

    it.effect(
      "should load the official source from the application URL when official is selected",
      () => {
        const { layer, requested } = routedLayer({
          [officialUrl]: () => official,
        });
        return Effect.gen(function* () {
          const loaded = yield* loadSources(select("official"));
          assert.deepStrictEqual(kinds(loaded.catalog), [
            "workspace",
            "server",
          ]);
          assert.deepStrictEqual(requested, [officialUrl]);
          assert.deepStrictEqual(
            loaded.sources.map(({ name, sourceUrl, freshness }) => ({
              name,
              sourceUrl,
              freshness,
            })),
            [
              {
                name: "official",
                sourceUrl: officialUrl,
                freshness: "current",
              },
            ],
          );
        }).pipe(Effect.provide(layer));
      },
    );

    it.effect(
      "should compose a custom module onto an official target when the source declares requires official",
      () => {
        const { layer } = routedLayer({
          [officialUrl]: () => official,
          [urls.ext]: () => ext,
        });
        return Effect.gen(function* () {
          const { catalog, sources } = yield* loadSources(
            select("official", "ext"),
          );
          assert.deepStrictEqual(
            sources.map((source) => source.name),
            ["official", "ext"],
          );
          assert.deepStrictEqual(
            catalog.getSource({ _tag: "module", id: "ext-auth" }),
            Option.some("ext"),
          );
          assert.deepStrictEqual(
            catalog.getSource({ _tag: "target", kind: "server" }),
            Option.some("official"),
          );
        }).pipe(Effect.provide(layer));
      },
    );

    it.effect(
      "should not request the official source when only a standalone custom catalog is selected",
      () => {
        const { layer, requested } = routedLayer({ [urls.acme]: () => acme });
        return Effect.gen(function* () {
          const { catalog } = yield* loadSources(select("acme"));
          assert.deepStrictEqual(kinds(catalog), ["workspace", "api"]);
          assert.deepStrictEqual(requested, [urls.acme]);
          const acmeModule = yield* catalog.getModule(
            ModuleId.make("acme-api-rest"),
          );
          assert.strictEqual(acmeModule.scripts?.length, 1);
        }).pipe(Effect.provide(layer));
      },
    );

    it.effect(
      "should union targets in selection order when two independent custom catalogs are selected",
      () => {
        const { layer } = routedLayer({
          [urls.acme]: () => acme,
          [urls.beta]: () => beta,
        });
        return Effect.gen(function* () {
          const { catalog } = yield* loadSources(select("acme", "beta"));
          assert.deepStrictEqual(kinds(catalog), [
            "workspace",
            "api",
            "worker",
          ]);
        }).pipe(Effect.provide(layer));
      },
    );

    it.effect(
      "should fail composition naming both sources when two sources define the same ID",
      () => {
        const { layer } = routedLayer({
          [urls.acme]: () => acme,
          [urls.beta]: () => json("beta", { targets: [target("api")] }),
        });
        return Effect.gen(function* () {
          const error = yield* Effect.flip(loadSources(select("acme", "beta")));
          assert.instanceOf(error, CatalogCompositionFailure);
          assert.match(
            error.message,
            /Duplicate target kind api in sources acme and beta/,
          );
        }).pipe(Effect.provide(layer));
      },
    );

    it.effect(
      "should fail with undeclared-reference when a source references official without declaring requires",
      () => {
        const { layer } = routedLayer({
          [officialUrl]: () => official,
          [urls.ext]: () =>
            json("ext", { modules: [module("ext-auth", "server")] }),
        });
        return Effect.gen(function* () {
          const error = yield* Effect.flip(
            loadSources(select("official", "ext")),
          );
          assert.instanceOf(error, CatalogCompositionFailure);
          assert.deepStrictEqual(
            error.issues.map(({ code, fragment }) => ({ code, fragment })),
            [{ code: "undeclared-reference", fragment: 1 }],
          );
          assert.match(
            error.message,
            /Source ext: Module ext-auth references target server from source official/,
          );
        }).pipe(Effect.provide(layer));
      },
    );

    it.effect(
      "should fail composition when one custom source references another custom source",
      () => {
        const { layer } = routedLayer({
          [urls.acme]: () => acme,
          [urls.beta]: () =>
            json("beta", { modules: [module("beta-job", "api")] }),
        });
        return Effect.gen(function* () {
          const error = yield* Effect.flip(loadSources(select("acme", "beta")));
          assert.instanceOf(error, CatalogCompositionFailure);
          assert.match(error.message, /references target api from source acme/);
        }).pipe(Effect.provide(layer));
      },
    );

    it.effect.each(sourceFailures)(
      "should fail with $reason naming $sourceName when $condition",
      ({ reason, routes, selection, sourceName, status }) => {
        const { layer } = routedLayer(routes);
        return Effect.gen(function* () {
          const error = yield* Effect.flip(loadSources(selection));
          assert.instanceOf(error, CatalogLoadFailure);
          assert.deepStrictEqual(
            {
              reason: error.reason._tag,
              sourceName: error.sourceName,
              sourceUrl: error.sourceUrl,
              status:
                "status" in error.reason ? error.reason.status : undefined,
            },
            { reason, sourceName, sourceUrl: urls[sourceName], status },
          );
          assert.match(
            error.message,
            new RegExp(`^Catalog source ${sourceName}: `),
          );
        }).pipe(Effect.provide(layer));
      },
    );

    it.effect(
      "should report each source's freshness when one source falls back to its cache",
      () => {
        let extCalls = 0;
        const { layer } = routedLayer({
          [officialUrl]: () => official,
          [urls.ext]: () => (++extCalls === 1 ? ext : 503),
        });
        return Effect.gen(function* () {
          yield* loadSources(select("official", "ext"));
          const { sources } = yield* loadSources(select("official", "ext"));
          assert.deepStrictEqual(
            sources.map(({ name, freshness, warning }) => ({
              name,
              freshness,
              warning: warning?.kind,
            })),
            [
              { name: "official", freshness: "current", warning: undefined },
              { name: "ext", freshness: "cached", warning: "stale" },
            ],
          );
        }).pipe(Effect.provide(layer));
      },
    );

    it.effect(
      "should name both sources and their freshness when a stale cache no longer composes with a current source",
      () => {
        let officialCalls = 0;
        let extCalls = 0;
        const { layer } = routedLayer({
          [officialUrl]: () =>
            ++officialCalls === 1
              ? official
              : json("official", { targets: [target("workspace")] }),
          [urls.ext]: () => (++extCalls === 1 ? ext : 503),
        });
        return Effect.gen(function* () {
          yield* loadSources(select("official", "ext"));
          const error = yield* Effect.flip(
            loadSources(select("official", "ext")),
          );
          assert.instanceOf(error, CatalogCompositionFailure);
          assert.match(
            error.message,
            /Source ext: Module ext-auth references missing target server/,
          );
          assert.match(
            error.message,
            /official \(https:\/\/stack-effect\.test\/registry\/v1\/catalog\.json, current\)/,
          );
          assert.match(
            error.message,
            /ext \(https:\/\/ext\.test\/v1\.json, cached, last validated at/,
          );
        }).pipe(Effect.provide(layer));
      },
    );
  });

  describe("source rules", () => {
    /** Contributes to the official server target and declares that dependency. */
    const ext = json("ext", {
      requires: ["official"],
      modules: [module("ext-auth", "server")],
    });

    it.effect(
      "should fail with missing-source and suggest --catalog official when a required official source is not selected",
      () => {
        const { layer } = routedLayer({ [urls.ext]: () => ext });
        return Effect.gen(function* () {
          const error = yield* Effect.flip(loadSources(select("ext")));
          assert.instanceOf(error, CatalogCompositionFailure);
          assert.deepStrictEqual(
            error.issues.map((issue) => issue.code),
            ["missing-source"],
          );
          assert.match(
            error.message,
            /Source ext requires the official catalog, which is not selected/,
          );
          assert.match(error.message, /--catalog official/);
        }).pipe(Effect.provide(layer));
      },
    );

    it.effect(
      "should attribute each copy's issues to its own source when two sources define the same module",
      () => {
        const { layer } = routedLayer({
          [urls.acme]: () =>
            json("acme", {
              targets: [target("api")],
              modules: [module("shared", "api")],
            }),
          [urls.beta]: () =>
            json("beta", {
              targets: [target("worker")],
              modules: [
                module("shared", "worker", {
                  conflictsWith: [ModuleId.make("beta-missing")],
                }),
              ],
            }),
        });
        return Effect.gen(function* () {
          const error = yield* Effect.flip(loadSources(select("acme", "beta")));
          assert.instanceOf(error, CatalogCompositionFailure);
          const missing = error.issues.find(
            (issue) => issue.code === "missing-reference",
          );
          assert.match(missing?.message ?? "", /^Source beta:/);
        }).pipe(Effect.provide(layer));
      },
    );

    it.effect(
      "should fail composition naming the official source when the official document declares requires",
      () => {
        const { layer } = routedLayer({
          [officialUrl]: () =>
            json("official", {
              targets: [target("workspace")],
              requires: ["official"],
            }),
        });
        return Effect.gen(function* () {
          const error = yield* Effect.flip(loadSources(select("official")));
          assert.instanceOf(error, CatalogCompositionFailure);
          assert.deepStrictEqual(
            error.issues.map(({ code, fragment, message }) => ({
              code,
              fragment,
              message,
            })),
            [
              {
                code: "invalid-shape",
                fragment: 0,
                message: "Source official cannot require itself",
              },
            ],
          );
          assert.deepStrictEqual(
            error.sources.map((source) => source.name),
            ["official"],
          );
        }).pipe(Effect.provide(layer));
      },
    );
  });

  describe("source cache", () => {
    const official = json("official", {
      targets: [target("workspace"), target("server")],
    });
    const acmeGood = json("acme", {
      targets: [target("api")],
      modules: [module("acme-rest", "api")],
    });
    /** Invalid on its own: its module is supported on a target nobody defines. */
    const acmeBroken = json("acme", {
      targets: [target("api")],
      modules: [module("acme-rest", "ghost")],
    });

    it.effect(
      "should serve the last validated cache when a source that published an invalid document becomes unavailable",
      () => {
        let calls = 0;
        const { layer } = routedLayer({
          [urls.acme]: () => [acmeGood, acmeBroken, 503][calls++] ?? 503,
        });
        return Effect.gen(function* () {
          yield* loadSources(select("acme"));
          const broken = yield* Effect.flip(loadSources(select("acme")));
          assert.instanceOf(broken, CatalogCompositionFailure);
          // Transport outage: the doc says use the source's *validated* cache.
          // `load` never caches an invalid document, so it would serve acmeGood.
          const { sources } = yield* loadSources(select("acme"));
          assert.strictEqual(sources[0]?.freshness, "cached");
        }).pipe(Effect.provide(layer));
      },
    );

    it.effect(
      "should fail with invalidSource before any fetch when a custom entry repeats the official URL",
      () => {
        const { layer, requested } = routedLayer({
          [officialUrl]: () => official,
        });
        return Effect.gen(function* () {
          const error = yield* Effect.flip(
            loadSources(
              select("official", { name: "mirror", url: officialUrl }),
            ),
          );
          assert.instanceOf(error, CatalogLoadFailure);
          assert.strictEqual(error.reason._tag, "CatalogSourceInvalid");
          assert.strictEqual(error.sourceName, "mirror");
          assert.strictEqual(error.sourceUrl, officialUrl);
          assert.deepStrictEqual(requested, []);
        }).pipe(Effect.provide(layer));
      },
    );
  });
});
