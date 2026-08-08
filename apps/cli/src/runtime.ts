import { BunServices } from "@effect/platform-bun";
import { NodeServices } from "@effect/platform-node";
import { Config, Effect, Layer } from "effect";
import { StackEffectServicesLayer } from "./services";

const CliConfig = Config.all({
  TARGET: Config.literal("bun", "node").pipe(Config.withDefault("node")),
});

const PlatformLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* CliConfig;
    return config.TARGET === "bun" ? BunServices.layer : NodeServices.layer;
  }),
);

export const StackEffectLayer = StackEffectServicesLayer.pipe(
  Layer.provideMerge(PlatformLayer),
);
