import { BrowserCrypto } from "@effect/platform-browser";
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
} from "effect/http";
import { CatalogCache } from "./CatalogCache";
import { CatalogLoader } from "./CatalogLoader";

/** Shared builders for the `CatalogLoader.loadSources` suites. */

export const officialUrl = "https://stack-effect.test/registry/v1/catalog.json";

export const urls = {
  ext: "https://ext.test/v1.json",
  acme: "https://acme.test/v1.json",
  beta: "https://beta.test/v1.json",
} as const;

export const target = (kind: string): typeof TargetDefinition.Type => ({
  kind: TargetKind.make(kind),
  title: kind,
  description: `The ${kind} target`,
  contributions: [],
});

export const module = (
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

/** Encodes a v1 catalog document as the JSON a source would serve. */
export const json = (
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

/** A route answers with a JSON body, or with an empty response of that status. */
export type Route = string | number;

/**
 * A loader whose HTTP client answers each URL from `routes` (404 otherwise)
 * and records every requested URL.
 */
export const routedLayer = (routes: Record<string, () => Route>) => {
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

type SelectedSource =
  | "official"
  | keyof typeof urls
  | { readonly name: string; readonly url: string };

/** Decodes a selection from named fixtures or explicit `{ name, url }` entries. */
export const select = (
  ...entries: ReadonlyArray<SelectedSource>
): CatalogSources =>
  Schema.decodeUnknownSync(CatalogSources)(
    entries.map((entry) =>
      typeof entry !== "string"
        ? entry
        : entry === "official"
          ? { name: entry }
          : { name: entry, url: urls[entry] },
    ),
  );

export const loadSources = (sources: CatalogSources) =>
  Effect.gen(function* () {
    const loader = yield* CatalogLoader;
    return yield* loader.loadSources({ sources, officialUrl });
  });
