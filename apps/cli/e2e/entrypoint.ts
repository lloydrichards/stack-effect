import { NodeCrypto } from "@effect/platform-node";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { exportLabsCatalog } from "@repo/catalog-labs/service";
import { exportOfficialCatalog } from "@repo/catalog-official/service";
import { OFFICIAL_CATALOG_URL } from "@repo/domain/CatalogSource";
import { CatalogCache } from "@repo/scaffold/CatalogCache";
import { CatalogLoader } from "@repo/scaffold/CatalogLoader";
import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";
import { cliProgram } from "../src/cliProgram";
import { CatalogProvider } from "../src/service/CatalogProvider";
import { ConfigureService } from "../src/service/ConfigureService";
import { labsFixtureUrl } from "./fixtures/labs-source";

// Use local definitions for the official URL and the Labs fixture URL. Fetch
// any other custom catalog from the test server specified by --catalog.
const FixtureHttpClient = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const network = yield* HttpClient.HttpClient;
    return HttpClient.make((request) => {
      const fixture =
        request.url === OFFICIAL_CATALOG_URL
          ? exportOfficialCatalog
          : request.url === labsFixtureUrl
            ? exportLabsCatalog
            : undefined;
      return fixture === undefined
        ? network.execute(request)
        : fixture.pipe(
            Effect.map((json) =>
              HttpClientResponse.fromWeb(
                request,
                new Response(json, {
                  headers: { "content-type": "application/json" },
                }),
              ),
            ),
            Effect.orDie,
          );
    });
  }),
).pipe(Layer.provide(FetchHttpClient.layer));

const FixtureLayer = CatalogProvider.official.pipe(
  Layer.provideMerge(
    CatalogLoader.layer.pipe(
      Layer.provideMerge(CatalogCache.layerMemory),
      Layer.provideMerge(FixtureHttpClient),
    ),
  ),
  Layer.provideMerge(ConfigureService.layer),
  Layer.provideMerge(Layer.merge(NodeServices.layer, NodeCrypto.layer)),
);

NodeRuntime.runMain(cliProgram.pipe(Effect.provide(FixtureLayer)), {
  disableErrorReporting: true,
});
