import { BrowserCrypto } from "@effect/platform-browser";
import { assert, describe, it } from "@effect/vitest";
import {
  CatalogDocument,
  type ModuleDefinition,
  ModuleId,
  type TargetDefinition,
  TargetKind,
} from "@repo/domain/Catalog";
import { CatalogSources } from "@repo/domain/CatalogSource";
import { Effect, Layer, Option, Schema } from "effect";
import {
  HttpClient,
  type HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";
import { CatalogCache } from "./CatalogCache";
import {
  CatalogCompositionFailure,
  CatalogLoader,
  CatalogLoadFailure,
} from "./CatalogLoader";

const officialUrl = "https://stack-effect.test/registry/v1/catalog.json";
const urls = {
  ext: "https://ext.test/v1.json",
  acme: "https://acme.test/v1.json",
  beta: "https://beta.test/v1.json",
} as const;

const target = (kind: string): typeof TargetDefinition.Type => ({
  kind: TargetKind.make(kind),
  title: kind,
  description: `The ${kind} target`,
  contributions: [],
});

const module = (
  id: string,
  kind: string,
  extra: Partial<typeof ModuleDefinition.Type> = {},
): typeof ModuleDefinition.Type => ({
  id: ModuleId.make(id),
  title: id,
  description: `The ${id} module`,
  supportedOn: [{ _tag: "kind", kind: TargetKind.make(kind) }],
  dependencies: [],
  contributions: [],
  ...extra,
});

const json = (
  catalogId: string,
  fragment: {
    readonly targets?: ReadonlyArray<typeof TargetDefinition.Type>;
    readonly modules?: ReadonlyArray<typeof ModuleDefinition.Type>;
    readonly requires?: ReadonlyArray<"official">;
  },
) =>
  Schema.encodeSync(Schema.fromJsonString(CatalogDocument))({
    formatVersion: 1,
    catalogId: Schema.NonEmptyString.make(catalogId),
    requiredCapabilities: [],
    targets: fragment.targets ?? [],
    modules: fragment.modules ?? [],
    ...(fragment.requires ? { requires: fragment.requires } : {}),
  });

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
      scripts: [{ label: "Generate client", command: "bun run generate" }],
    }),
  ],
});
const beta = json("beta", { targets: [target("worker")] });

type Route = string | number;

const routedLayer = (routes: Record<string, () => Route>) => {
  const requested: Array<string> = [];
  const respond = (request: HttpClientRequest.HttpClientRequest) => {
    requested.push(request.url);
    const route = routes[request.url]?.() ?? 404;
    return HttpClientResponse.fromWeb(
      request,
      typeof route === "number"
        ? new Response(null, { status: route })
        : new Response(route, {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
    );
  };
  const layer = CatalogLoader.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) => Effect.sync(() => respond(request))),
        ),
        CatalogCache.memory,
        BrowserCrypto.layer,
      ),
    ),
  );
  return { layer, requested };
};

const select = (
  ...names: ReadonlyArray<"official" | keyof typeof urls>
): CatalogSources =>
  Schema.decodeUnknownSync(CatalogSources)(
    names.map((name) =>
      name === "official" ? { name } : { name, url: urls[name] },
    ),
  );

const loadSources = (sources: CatalogSources) =>
  Effect.gen(function* () {
    const loader = yield* CatalogLoader;
    return yield* loader.loadSources({ sources, officialUrl });
  });

const kinds = (catalog: {
  readonly toCatalogTree: { readonly targets: ReadonlyArray<{ kind: string }> };
}) => catalog.toCatalogTree.targets.map((entry) => entry.kind);

describe("loadSources", () => {
  it.effect("loads the official source from the application URL", () => {
    const { layer, requested } = routedLayer({ [officialUrl]: () => official });
    return Effect.gen(function* () {
      const loaded = yield* loadSources(select("official"));
      assert.deepStrictEqual(kinds(loaded.catalog), ["workspace", "server"]);
      assert.deepStrictEqual(requested, [officialUrl]);
      assert.deepStrictEqual(
        loaded.sources.map(({ name, sourceUrl, freshness }) => ({
          name,
          sourceUrl,
          freshness,
        })),
        [{ name: "official", sourceUrl: officialUrl, freshness: "current" }],
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    "composes a custom module against the official target it declares",
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
    "loads a standalone custom catalog without requesting the official source",
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

  it.effect("unions two independent custom catalogs", () => {
    const { layer } = routedLayer({
      [urls.acme]: () => acme,
      [urls.beta]: () => beta,
    });
    return Effect.gen(function* () {
      const { catalog } = yield* loadSources(select("acme", "beta"));
      assert.deepStrictEqual(kinds(catalog), ["workspace", "api", "worker"]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("rejects a duplicate ID and names both sources", () => {
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
  });

  it.effect("fails when a declared official dependency is not selected", () => {
    const { layer } = routedLayer({ [urls.ext]: () => ext });
    return Effect.gen(function* () {
      const error = yield* Effect.flip(loadSources(select("ext")));
      assert.instanceOf(error, CatalogCompositionFailure);
      assert.include(
        error.issues.map((issue) => issue.code),
        "missing-source",
      );
      assert.match(
        error.message,
        /Source ext requires the official catalog, which is not selected/,
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    "rejects an undeclared reference to the official source even when selected",
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

  it.effect("rejects a reference from one custom source into another", () => {
    const { layer } = routedLayer({
      [urls.acme]: () => acme,
      [urls.beta]: () => json("beta", { modules: [module("beta-job", "api")] }),
    });
    return Effect.gen(function* () {
      const error = yield* Effect.flip(loadSources(select("acme", "beta")));
      assert.instanceOf(error, CatalogCompositionFailure);
      assert.match(error.message, /references target api from source acme/);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    "rejects a document that requires a source other than official",
    () => {
      const { layer } = routedLayer({
        [urls.beta]: () =>
          beta.replace(
            '"formatVersion":1',
            '"formatVersion":1,"requires":["acme"]',
          ),
      });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(loadSources(select("beta")));
        assert.instanceOf(error, CatalogLoadFailure);
        assert.strictEqual(error.reason, "invalidCatalog");
        assert.strictEqual(error.sourceName, "beta");
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect(
    "names the selected source that returned an invalid document",
    () => {
      const { layer } = routedLayer({
        [officialUrl]: () => official,
        [urls.acme]: () => "{",
      });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(
          loadSources(select("official", "acme")),
        );
        assert.instanceOf(error, CatalogLoadFailure);
        assert.strictEqual(error.reason, "invalidJson");
        assert.strictEqual(error.sourceName, "acme");
        assert.strictEqual(error.sourceUrl, urls.acme);
        assert.match(error.message, /^Catalog source acme: /);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect("falls back per source and reports each source's freshness", () => {
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
  });

  it.effect("fails the selection when any source has no usable data", () => {
    const { layer } = routedLayer({
      [urls.acme]: () => acme,
      [urls.beta]: () => 503,
    });
    return Effect.gen(function* () {
      const error = yield* Effect.flip(loadSources(select("acme", "beta")));
      assert.instanceOf(error, CatalogLoadFailure);
      assert.strictEqual(error.reason, "unavailable");
      assert.strictEqual(error.sourceName, "beta");
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    "names both sources when a stale cache no longer matches a current source",
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
