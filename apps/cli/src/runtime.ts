import { BunServices } from "@effect/platform-bun";
import { NodeServices } from "@effect/platform-node";
import { BundledCatalogLayer } from "@repo/catalog/authoring";
import { Config, Effect, Layer } from "effect";
import { StackEffectServicesLayer } from "./services";

const CliConfig = Config.all({
  TARGET: Config.Literals(["bun", "node"]).pipe(Config.withDefault("node")),
});

export const PlatformLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* CliConfig;
    return config.TARGET === "bun" ? BunServices.layer : NodeServices.layer;
  }),
);

export const StackEffectLayer = StackEffectServicesLayer.pipe(
  Layer.provideMerge(BundledCatalogLayer),
  Layer.provideMerge(PlatformLayer),
);
