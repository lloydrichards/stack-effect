import { BunServices, BunCrypto } from "@effect/platform-bun";
import { NodeServices, NodeCrypto } from "@effect/platform-node";
import { CatalogLoader } from "@repo/scaffold/Catalog";
import { Config, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { CatalogProvider } from "./service/CatalogProvider";
import { ConfigureService } from "./service/ConfigureService";
import { fileCatalogCacheLayer } from "./service/FileCatalogCache";

const CliConfig = Config.all({
  TARGET: Config.Literals(["bun", "node"]).pipe(Config.withDefault("node")),
});

export const PlatformLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* CliConfig;
    return config.TARGET === "bun"
      ? Layer.merge(BunServices.layer, BunCrypto.layer)
      : Layer.merge(NodeServices.layer, NodeCrypto.layer);
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
