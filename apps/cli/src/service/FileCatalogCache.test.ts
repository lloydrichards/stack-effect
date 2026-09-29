import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { CatalogCache } from "@repo/scaffold";
import { Effect, FileSystem, Path } from "effect";
import { fileCatalogCacheLayer } from "./FileCatalogCache";

const sourceUrl = "https://catalog.example.test/catalog.json";

const entryFor = (url: string, label: string, validatedAt: number) => ({
  sourceUrl: url,
  bytes: new TextEncoder().encode(label),
  digest: `${label}-digest`,
  etag: `"${label}"`,
  validatedAt,
});

/** Runs `body` against a file cache rooted in a fresh temp directory. */
const withCacheDirectory = <A, E>(
  body: (
    directory: string,
  ) => Effect.Effect<A, E, CatalogCache | FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({
      prefix: "stack-effect-catalog-cache-",
    });
    return yield* body(directory).pipe(
      Effect.provide(fileCatalogCacheLayer(directory)),
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

it.effect(
  "should return the latest entry and keep one file when a source is written twice",
  () =>
    withCacheDirectory((directory) =>
      Effect.gen(function* () {
        const cache = yield* CatalogCache;
        const fs = yield* FileSystem.FileSystem;
        const first = entryFor(sourceUrl, "first", 1_000);
        yield* cache.write(first);
        assert.deepEqual(yield* cache.read(sourceUrl), first);

        const second = entryFor(sourceUrl, "second", 2_000);
        yield* cache.write(second);
        assert.deepEqual(yield* cache.read(sourceUrl), second);
        assert.strictEqual((yield* fs.readDirectory(directory)).length, 1);
      }),
    ),
);

it.effect("should read no entry when a source was never written", () =>
  withCacheDirectory(() =>
    Effect.gen(function* () {
      const cache = yield* CatalogCache;
      assert.isUndefined(yield* cache.read(sourceUrl));
    }),
  ),
);

it.effect(
  "should fail with CatalogCacheFailure when the cached file is corrupt",
  () =>
    withCacheDirectory((directory) =>
      Effect.gen(function* () {
        const cache = yield* CatalogCache;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* cache.write(entryFor(sourceUrl, "first", 1_000));
        const [file] = yield* fs.readDirectory(directory);
        assert.isDefined(file);
        yield* fs.writeFileString(path.join(directory, file ?? ""), "{");
        const error = yield* Effect.flip(cache.read(sourceUrl));
        assert.propertyVal(error, "_tag", "CatalogCacheFailure");
      }),
    ),
);

it.effect("should keep entries apart when two sources are written", () =>
  withCacheDirectory(() =>
    Effect.gen(function* () {
      const cache = yield* CatalogCache;
      const otherUrl = "https://other.example.test/catalog.json";
      const first = entryFor(sourceUrl, "first", 1_000);
      const other = entryFor(otherUrl, "other", 2_000);
      yield* cache.write(first);
      yield* cache.write(other);
      assert.deepEqual(yield* cache.read(sourceUrl), first);
      assert.deepEqual(yield* cache.read(otherUrl), other);
    }),
  ),
);
