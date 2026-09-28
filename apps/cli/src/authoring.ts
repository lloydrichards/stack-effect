import { NodeRuntime } from "@effect/platform-node";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import { Effect, Layer } from "effect";
import { cliProgram } from "./cliProgram";
import { PlatformLayer } from "./runtime";
import { CatalogProvider } from "./service/CatalogProvider";
import { ConfigureService } from "./service/ConfigureService";

const AuthoringLayer = CatalogProvider.authoring.pipe(
  Layer.provideMerge(OfficialCatalogLayer),
  Layer.provideMerge(ConfigureService.layer),
  Layer.provideMerge(PlatformLayer),
);

NodeRuntime.runMain(cliProgram.pipe(Effect.provide(AuthoringLayer)), {
  disableErrorReporting: true,
});
