import { NodeRuntime } from "@effect/platform-node";
import { BundledCatalogLayer } from "@repo/catalog/authoring";
import { Effect, Layer } from "effect";
import { cliProgram } from "./cliProgram";
import { PlatformLayer } from "./runtime";
import { CatalogProvider } from "./service/CatalogProvider";
import { ConfigureService } from "./service/ConfigureService";

const AuthoringLayer = CatalogProvider.authoring.pipe(
  Layer.provideMerge(BundledCatalogLayer),
  Layer.provideMerge(ConfigureService.layer),
  Layer.provideMerge(PlatformLayer),
);

NodeRuntime.runMain(cliProgram.pipe(Effect.provide(AuthoringLayer)), {
  disableErrorReporting: true,
});
