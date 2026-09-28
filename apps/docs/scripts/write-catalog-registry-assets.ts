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
const rebuild = "run `bun run --cwd catalogs/official build` first";
const missingBuild = new Error(`No built official catalog; ${rebuild}.`);
const staleBuild = new Error(
  `The built official catalog is out of date; ${rebuild}.`,
);

await Effect.runPromise(
  Effect.gen(function* () {
    // Publish the catalog workspace's build output, refusing a missing or
    // stale build so the site never serves definitions it did not check.
    const assets = yield* generateCatalogRegistryAssets();
    const built = yield* Effect.tryPromise({
      try: () => readFile(publishedCatalogUrl, "utf8"),
      catch: () => missingBuild,
    });
    if (built !== assets[CATALOG_ASSET_PATH])
      return yield* Effect.fail(staleBuild);
    yield* Effect.forEach(Object.entries(assets), ([path, source]) =>
      Effect.promise(async () => {
        const destination = join(publicDirectory, path.slice(1));
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, source);
      }),
    );
  }),
);
