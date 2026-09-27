import { BunServices } from "@effect/platform-bun";
import { NodeServices } from "@effect/platform-node";
import { CatalogLoader } from "@repo/scaffold";
import { Config, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { CatalogProvider } from "./service/CatalogProvider";
import { ConfigureService } from "./service/ConfigureService";
import { fileCatalogCacheLayer } from "./service/FileCatalogCache";

const CliConfig = Config.all({
  TARGET: Config.Literals(["bun", "node"]).pipe(Config.withDefault("node")),
});

export const PlatformLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* CliConfig;
    return config.TARGET === "bun" ? BunServices.layer : NodeServices.layer;
  }),
);

export const StackEffectLayer = CatalogProvider.official.pipe(
  Layer.provideMerge(
    CatalogLoader.layer.pipe(
      Layer.provideMerge(fileCatalogCacheLayer()),
      Layer.provideMerge(FetchHttpClient.layer),
    ),
  ),
  Layer.provideMerge(ConfigureService.layer),
  Layer.provideMerge(PlatformLayer),
);
