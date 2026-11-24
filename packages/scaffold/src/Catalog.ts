/**
 * Catalog loading: fetches, verifies, caches, and composes registry catalogs
 * into the CatalogReader the other stages use.
 */
import type { CatalogReader } from "@repo/catalog/Catalog";
import type {
  CatalogCacheEntry,
  CatalogCacheError,
  CatalogCompositionError,
  CatalogLoadError,
  CatalogLoadWarning,
  CatalogSources,
  LoadedCatalogSource,
} from "@repo/domain/Catalog";
import { Context, Effect, Layer, Ref } from "effect";
import type * as Digest from "effect/crypto/Digest";
import type { HttpClient } from "effect/http";
import * as internal from "./internal/catalogLoader";

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
    ) => Effect.Effect<CatalogCacheEntry | undefined, CatalogCacheError>;
    // Adapters must publish the complete entry atomically.
    readonly write: (
      entry: CatalogCacheEntry,
    ) => Effect.Effect<void, CatalogCacheError>;
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

/**
 * One catalog document loaded as a `CatalogReader`, with where it came from.
 *
 * **When to use**
 *
 * Read it from `CatalogLoader.load` when one URL is the whole catalog.
 */
export type LoadedCatalog = {
  readonly catalog: CatalogReader["Service"];
  readonly sourceUrl: string;
  readonly digest: string;
  readonly freshness: "current" | "cached";
  readonly warning?: CatalogLoadWarning | undefined;
};

/**
 * The selected sources composed into one catalog, with how each loaded.
 *
 * **When to use**
 *
 * Read it from `CatalogLoader.loadSources`. Reuse `catalog` across the whole
 * operation, and report `sources` to the user.
 */
export type LoadedCatalogSet = {
  readonly catalog: CatalogReader["Service"];
  readonly sources: ReadonlyArray<LoadedCatalogSource>;
};

/**
 * Loads one catalog URL, or every selected catalog source, through the cache.
 *
 * **When to use**
 *
 * Production CLI commands and Recipe Builder sessions load catalogs through
 * it, then provide the resulting `CatalogReader` to the scaffold services.
 *
 * **Gotchas**
 *
 * A source that cannot be fetched falls back to its cached copy with a
 * `stale` warning. A source with no usable copy fails the whole selection.
 * Finalize scripts are allowed only when the caller says so; a downloaded
 * catalog cannot grant itself that authority.
 */
export class CatalogLoader extends Context.Service<
  CatalogLoader,
  {
    readonly load: (input: {
      readonly sourceUrl: string;
      // Application-owned authority. Never inferred from a downloaded catalogId.
      readonly allowFinalizeScripts?: boolean;
    }) => Effect.Effect<LoadedCatalog, CatalogLoadError>;
    // Loads every selected source, then composes them once. Any source without
    // usable data fails the whole selection.
    readonly loadSources: (input: {
      readonly sources: CatalogSources;
      // Application-owned URL for the reserved `official` source.
      readonly officialUrl: string;
    }) => Effect.Effect<
      LoadedCatalogSet,
      CatalogLoadError | CatalogCompositionError
    >;
  }
>()("@repo/scaffold/CatalogLoader") {
  static readonly layer: Layer.Layer<
    CatalogLoader,
    never,
    HttpClient.HttpClient | CatalogCache | Digest.Digest
  > = Layer.effect(CatalogLoader, CatalogCache.use(internal.make));
}
