/**
 * Storage for validated catalog documents, so catalog loading can revalidate
 * cheaply and fall back to the last good copy when a source is unreachable.
 * Each runtime provides its own adapter.
 */
import type {
  CatalogCacheEntry,
  CatalogCacheFailure,
} from "@repo/domain/CatalogSource";
import { Context, Effect, Layer, Ref } from "effect";

const copyEntry = (entry: CatalogCacheEntry): CatalogCacheEntry => ({
  ...entry,
  bytes: new Uint8Array(entry.bytes),
});

/**
 * Reads and writes cached catalog documents by source URL.
 *
 * **When to use**
 *
 * Provide it to `CatalogLoader.layer`: a file cache in the CLI, IndexedDB in
 * the browser, or `layerMemory` in tests and controlled fixtures.
 *
 * **Gotchas**
 *
 * `read` returns `undefined` for a miss. Adapters must publish the complete
 * entry atomically, so a reader never sees half of a write.
 */
export class CatalogCache extends Context.Service<
  CatalogCache,
  {
    readonly read: (
      sourceUrl: string,
    ) => Effect.Effect<CatalogCacheEntry | undefined, CatalogCacheFailure>;
    // Adapters must publish the complete entry atomically.
    readonly write: (
      entry: CatalogCacheEntry,
    ) => Effect.Effect<void, CatalogCacheFailure>;
  }
>()("@repo/scaffold/CatalogCache") {
  // A deterministic, runtime-neutral cache for tests and controlled fixtures.
  static readonly layerMemory: Layer.Layer<CatalogCache> = Layer.effect(
    CatalogCache,
    Effect.gen(function* () {
      const entries = yield* Ref.make(new Map<string, CatalogCacheEntry>());

      return CatalogCache.of({
        read: (sourceUrl) =>
          Ref.get(entries).pipe(
            Effect.map((items) => {
              const entry = items.get(sourceUrl);
              return entry === undefined ? undefined : copyEntry(entry);
            }),
          ),
        write: (entry) =>
          Ref.update(entries, (items) =>
            new Map(items).set(entry.sourceUrl, copyEntry(entry)),
          ),
      });
    }),
  );
}
