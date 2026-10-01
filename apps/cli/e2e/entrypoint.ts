import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { exportOfficialCatalog } from "@repo/catalog-official/service";
import { CatalogCache, CatalogLoader } from "@repo/scaffold";
import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";
import { cliProgram } from "../src/cliProgram";
import {
  CatalogProvider,
  OFFICIAL_CATALOG_URL,
} from "../src/service/CatalogProvider";
import { ConfigureService } from "../src/service/ConfigureService";

// The official catalog comes from local definitions; selected custom catalogs
// are fetched from the controlled fixture server named in --catalog.
const FixtureHttpClient = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const json = yield* exportOfficialCatalog;
    const network = yield* HttpClient.HttpClient;
    return HttpClient.make((request) =>
      request.url === OFFICIAL_CATALOG_URL
        ? Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(json, {
                headers: { "content-type": "application/json" },
              }),
            ),
          )
        : network.execute(request),
    );
  }),
).pipe(Layer.provide(FetchHttpClient.layer));

const FixtureLayer = CatalogProvider.official.pipe(
  Layer.provideMerge(
    CatalogLoader.layer.pipe(
      Layer.provideMerge(CatalogCache.memory),
      Layer.provideMerge(FixtureHttpClient),
    ),
  ),
  Layer.provideMerge(ConfigureService.layer),
  Layer.provideMerge(NodeServices.layer),
);

NodeRuntime.runMain(cliProgram.pipe(Effect.provide(FixtureLayer)), {
  disableErrorReporting: true,
});
