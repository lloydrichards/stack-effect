import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { publishedCatalogUrl } from "@repo/catalog-official/service";
import { Effect } from "effect";
import {
  CATALOG_ASSET_PATH,
  generateCatalogRegistryAssets,
} from "./catalog-registry-assets";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));

await Effect.runPromise(
  Effect.gen(function* () {
    // Publish the catalog workspace's build output rather than rebuilding it.
    const catalog = yield* Effect.promise(() =>
      readFile(publishedCatalogUrl, "utf8"),
    );
    const assets = {
      ...(yield* generateCatalogRegistryAssets()),
      [CATALOG_ASSET_PATH]: catalog,
    };
    yield* Effect.forEach(Object.entries(assets), ([path, source]) =>
      Effect.promise(async () => {
        const destination = join(publicDirectory, path.slice(1));
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, source);
      }),
    );
  }),
);
