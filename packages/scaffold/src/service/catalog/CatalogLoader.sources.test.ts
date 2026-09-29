import { assert, describe, it } from "@effect/vitest";
import { ModuleId } from "@repo/domain/Catalog";
import type { CatalogSources } from "@repo/domain/CatalogSource";
import { Effect, Option } from "effect";
import {
  CatalogCompositionFailure,
  CatalogLoadFailure,
  type CatalogLoadReason,
} from "./CatalogLoader";
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
} from "./testSources";

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

const kinds = (catalog: {
  readonly toCatalogTree: { readonly targets: ReadonlyArray<{ kind: string }> };
}) => catalog.toCatalogTree.targets.map((entry) => entry.kind);

interface SourceFailureCase {
  readonly reason: CatalogLoadReason;
  readonly sourceName: keyof typeof urls;
  readonly condition: string;
  readonly routes: Record<string, () => Route>;
  readonly selection: CatalogSources;
  readonly status?: number;
}

const sourceFailures: ReadonlyArray<SourceFailureCase> = [
  {
    reason: "invalidJson",
    sourceName: "acme",
    condition: "a selected source returns malformed JSON",
    routes: { [officialUrl]: () => official, [urls.acme]: () => "{" },
    selection: select("official", "acme"),
  },
  {
    reason: "invalidCatalog",
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
    reason: "unavailable",
    sourceName: "beta",
    condition: "one source has no usable data",
    routes: { [urls.acme]: () => acme, [urls.beta]: () => 503 },
    selection: select("acme", "beta"),
    status: 503,
  },
  {
    reason: "httpStatus",
    sourceName: "acme",
    condition: "a source answers with a permanent HTTP status",
    routes: { [urls.acme]: () => 410 },
    selection: select("acme"),
    status: 410,
  },
];

describe("loadSources", () => {
  it.effect(
    "should load the official source from the application URL when official is selected",
    () => {
      const { layer, requested } = routedLayer({
        [officialUrl]: () => official,
      });
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
        assert.deepStrictEqual(kinds(catalog), ["workspace", "api", "worker"]);
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
            reason: error.reason,
            sourceName: error.sourceName,
            sourceUrl: error.sourceUrl,
            status: error.status,
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
