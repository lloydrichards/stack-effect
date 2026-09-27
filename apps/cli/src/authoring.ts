import { NodeRuntime } from "@effect/platform-node";
import { BundledCatalogLayer } from "@repo/catalog/authoring";
import { Effect, Layer } from "effect";
import { cliProgram } from "./cliProgram";
import { PlatformLayer } from "./runtime";
import { StackEffectServicesLayer } from "./services";

const AuthoringLayer = StackEffectServicesLayer.pipe(
  Layer.provideMerge(BundledCatalogLayer),
  Layer.provideMerge(PlatformLayer),
);

NodeRuntime.runMain(cliProgram.pipe(Effect.provide(AuthoringLayer)), {
  disableErrorReporting: true,
});
