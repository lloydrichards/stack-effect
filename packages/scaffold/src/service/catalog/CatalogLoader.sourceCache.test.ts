import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { CatalogCompositionFailure, CatalogLoadFailure } from "./CatalogLoader";
import {
  json,
  loadSources,
  module,
  officialUrl,
  routedLayer,
  select,
  target,
  urls,
} from "./testSources";

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

describe("loadSources cache and aliases", () => {
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
          loadSources(select("official", { name: "mirror", url: officialUrl })),
        );
        assert.instanceOf(error, CatalogLoadFailure);
        assert.strictEqual(error.reason, "invalidSource");
        assert.strictEqual(error.sourceName, "mirror");
        assert.strictEqual(error.sourceUrl, officialUrl);
        assert.deepStrictEqual(requested, []);
      }).pipe(Effect.provide(layer));
    },
  );
});
