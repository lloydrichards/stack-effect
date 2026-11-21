import { NodeRuntime } from "@effect/platform-node";
import { buildLabsCatalog } from "@repo/catalog-labs/service";
import { officialCatalogLayerWith } from "@repo/catalog-official/service";
import { Effect, Layer } from "effect";
import { cliProgram } from "./cliProgram";
import { PlatformLayer } from "./runtime";
import { CatalogProvider } from "./service/CatalogProvider";
import { ConfigureService } from "./service/ConfigureService";

const AuthoringLayer = CatalogProvider.authoring.pipe(
  Layer.provideMerge(
    Layer.unwrap(
      buildLabsCatalog.pipe(
        Effect.map(({ document }) => officialCatalogLayerWith([document])),
      ),
    ),
  ),
  Layer.provideMerge(ConfigureService.layer),
  Layer.provideMerge(PlatformLayer),
);

NodeRuntime.runMain(cliProgram.pipe(Effect.provide(AuthoringLayer)), {
  disableErrorReporting: true,
});
