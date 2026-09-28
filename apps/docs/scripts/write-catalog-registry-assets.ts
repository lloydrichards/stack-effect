import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { publishedCatalogUrl } from "@repo/catalog-official/service";
import { Data, Effect, Option } from "effect";
import {
  CATALOG_ASSET_PATH,
  generateCatalogRegistryAssets,
  publishableCatalog,
} from "./catalog-registry-assets";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
class OfficialCatalogBuildUnreadable extends Data.TaggedError(
  "OfficialCatalogBuildUnreadable",
)<{ readonly cause: unknown }> {}

const isMissingFile = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "ENOENT";

await Effect.runPromise(
  Effect.gen(function* () {
    // Publish the catalog workspace's build output, refusing a missing or
    // stale build so the site never serves definitions it did not check.
    const assets = yield* generateCatalogRegistryAssets();
    const built = yield* Effect.tryPromise({
      try: () =>
        readFile(publishedCatalogUrl, "utf8").then(Option.some, (error) =>
          isMissingFile(error) ? Option.none() : Promise.reject(error),
        ),
      catch: (cause) => new OfficialCatalogBuildUnreadable({ cause }),
    });
    yield* publishableCatalog(built, assets[CATALOG_ASSET_PATH]);
    yield* Effect.forEach(Object.entries(assets), ([path, source]) =>
      Effect.promise(async () => {
        const destination = join(publicDirectory, path.slice(1));
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, source);
      }),
    );
  }),
);
