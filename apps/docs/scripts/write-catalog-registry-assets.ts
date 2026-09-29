import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Data, Effect, Option } from "effect";
import {
  generateCatalogRegistryAssets,
  publishableCatalog,
  publishedCatalogs,
} from "./catalog-registry-assets";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
class CatalogBuildUnreadable extends Data.TaggedError(
  "CatalogBuildUnreadable",
)<{ readonly cause: unknown }> {}

const isMissingFile = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "ENOENT";

await Effect.runPromise(
  Effect.gen(function* () {
    // Publish each catalog workspace's build output, refusing a missing or
    // stale build so the site never serves definitions it did not check.
    const assets = yield* generateCatalogRegistryAssets();
    yield* Effect.forEach(publishedCatalogs, (catalog) =>
      Effect.tryPromise({
        try: () =>
          readFile(catalog.build, "utf8").then(Option.some, (error) =>
            isMissingFile(error) ? Option.none() : Promise.reject(error),
          ),
        catch: (cause) => new CatalogBuildUnreadable({ cause }),
      }).pipe(
        Effect.flatMap((built) =>
          publishableCatalog(catalog, built, assets[catalog.asset]),
        ),
      ),
    );
    yield* Effect.forEach(Object.entries(assets), ([path, source]) =>
      Effect.promise(async () => {
        const destination = join(publicDirectory, path.slice(1));
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, source);
      }),
    );
  }),
);
