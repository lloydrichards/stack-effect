import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { CatalogCache } from "@repo/scaffold";
import { Effect, FileSystem } from "effect";
import { fileCatalogCacheLayer } from "./FileCatalogCache";

it.effect("atomically replaces a complete cache entry outside a project", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({
      prefix: "stack-effect-catalog-cache-",
    });
    yield* Effect.gen(function* () {
      const cache = yield* CatalogCache;
      const sourceUrl = "https://catalog.example.test/catalog.json";
      const first = {
        sourceUrl,
        bytes: new TextEncoder().encode("first"),
        digest: "first-digest",
        etag: '"first"',
        validatedAt: 1_000,
      };
      yield* cache.write(first);
      assert.deepEqual(yield* cache.read(sourceUrl), first);

      const second = {
        ...first,
        bytes: new TextEncoder().encode("second"),
        digest: "second-digest",
        etag: '"second"',
        validatedAt: 2_000,
      };
      yield* cache.write(second);
      assert.deepEqual(yield* cache.read(sourceUrl), second);
      assert.strictEqual((yield* fs.readDirectory(directory)).length, 1);
    }).pipe(Effect.provide(fileCatalogCacheLayer(directory)));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
