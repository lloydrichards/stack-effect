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
void kinds;
void acme;
void beta;
void CatalogLoadFailure;

describe("loadSources source rules", () => {
  it.effect(
    "missing required source fails before composition and suggests --catalog official",
    () => {
      const { layer } = routedLayer({ [urls.ext]: () => ext });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(loadSources(select("ext")));
        assert.instanceOf(error, CatalogCompositionFailure);
        assert.deepStrictEqual(
          error.issues.map((i) => i.code),
          ["missing-source"],
        );
        assert.match(error.message, /--catalog official/);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect(
    "duplicate module attributes each copy's issues to its own source",
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
          (i) => i.code === "missing-reference",
        );
        assert.match(missing?.message ?? "", /^Source beta:/);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect("requires is rejected on the official document itself", () => {
    const { layer } = routedLayer({
      [officialUrl]: () =>
        json("official", {
          targets: [target("workspace")],
          requires: ["official"],
        }),
    });
    return Effect.gen(function* () {
      const exit = yield* Effect.exit(loadSources(select("official")));
      assert.strictEqual(exit._tag, "Failure");
    }).pipe(Effect.provide(layer));
  });
});
