import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { generateCatalogRegistryAssets } from "./catalog-registry-assets";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));

await Effect.runPromise(
  Effect.gen(function* () {
    const assets = yield* generateCatalogRegistryAssets();
    yield* Effect.forEach(Object.entries(assets), ([path, source]) =>
      Effect.promise(async () => {
        const destination = join(publicDirectory, path.slice(1));
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, source);
      }),
    );
  }),
);
