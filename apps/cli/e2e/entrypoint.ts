import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { exportOfficialCatalog } from "@repo/catalog/authoring";
import { CatalogCache, CatalogLoader } from "@repo/scaffold";
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { cliProgram } from "../src/cliProgram";
import { CatalogProvider } from "../src/service/CatalogProvider";
import { ConfigureService } from "../src/service/ConfigureService";

const FixtureHttpClient = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const json = yield* exportOfficialCatalog();
    return HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(json, {
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    );
  }),
);

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
