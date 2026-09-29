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
import { Effect, Layer, Schema } from "effect";
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
const acmeUrl = "https://acme.test/v1.json";

const target = (kind: string): typeof TargetDefinition.Type => ({
  kind: TargetKind.make(kind),
  title: kind,
  description: `The ${kind} target`,
  contributions: [],
});

const module = (id: string, kind: string): typeof ModuleDefinition.Type => ({
  id: ModuleId.make(id),
  title: id,
  description: `The ${id} module`,
  supportedOn: [{ _tag: "kind", kind: TargetKind.make(kind) }],
  dependencies: [],
  contributions: [],
});

const json = (
  catalogId: string,
  targets: ReadonlyArray<typeof TargetDefinition.Type>,
  modules: ReadonlyArray<typeof ModuleDefinition.Type> = [],
) =>
  Schema.encodeSync(Schema.fromJsonString(CatalogDocument))({
    formatVersion: 1,
    catalogId: Schema.NonEmptyString.make(catalogId),
    requiredCapabilities: [],
    targets,
    modules,
  });

const official = json("official", [target("workspace"), target("server")]);
const acmeGood = json("acme", [target("api")], [module("acme-rest", "api")]);
/** Invalid on its own: its module is supported on a target nobody defines. */
const acmeBroken = json(
  "acme",
  [target("api")],
  [module("acme-rest", "ghost")],
);

const routedLayer = (routes: Record<string, () => string | number>) => {
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

const loadSources = (input: unknown) =>
  Effect.gen(function* () {
    const loader = yield* CatalogLoader;
    const sources = yield* Schema.decodeUnknownEffect(CatalogSources)(input);
    return yield* loader.loadSources({ sources, officialUrl });
  });

describe("loadSources cache and aliases", () => {
  it.effect(
    "keeps the last validated cache when a source publishes a document that is invalid on its own",
    () => {
      let calls = 0;
      const { layer } = routedLayer({
        [acmeUrl]: () => [acmeGood, acmeBroken, 503][calls++] ?? 503,
      });
      const select = [{ name: "acme", url: acmeUrl }];
      return Effect.gen(function* () {
        yield* loadSources(select);
        const broken = yield* Effect.flip(loadSources(select));
        assert.instanceOf(broken, CatalogCompositionFailure);
        // Transport outage: the doc says use the source's *validated* cache.
        // `load` never caches an invalid document, so it would serve acmeGood.
        const { sources } = yield* loadSources(select);
        assert.strictEqual(sources[0]?.freshness, "cached");
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect(
    "rejects a custom entry that repeats the official URL before fetching it twice",
    () => {
      const { layer, requested } = routedLayer({
        [officialUrl]: () => official,
      });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(
          loadSources([
            { name: "official" },
            { name: "mirror", url: officialUrl },
          ]),
        );
        // "the same URL under two names" is a validation error before any fetch.
        assert.notInstanceOf(error, CatalogCompositionFailure);
        assert.strictEqual(requested.length, 0);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect(
    "keeps instanceof, sourceName and HTTP status on load failures",
    () => {
      const { layer } = routedLayer({ [acmeUrl]: () => 410 });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(
          loadSources([{ name: "acme", url: acmeUrl }]),
        );
        assert.instanceOf(error, CatalogLoadFailure);
        if (!(error instanceof CatalogLoadFailure)) return;
        assert.strictEqual(error.status, 410);
        assert.strictEqual(error.reason, "httpStatus");
        assert.strictEqual(error.sourceName, "acme");
      }).pipe(Effect.provide(layer));
    },
  );
});
