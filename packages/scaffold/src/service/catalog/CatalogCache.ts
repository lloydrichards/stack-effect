import { Context, Data, Effect, Layer, Ref } from "effect";

export interface CatalogCacheEntry {
  readonly sourceUrl: string;
  readonly bytes: Uint8Array;
  readonly digest: string;
  readonly etag?: string;
  readonly lastModified?: string;
  readonly validatedAt: number;
}

export class CatalogCacheFailure extends Data.TaggedError(
  "CatalogCacheFailure",
)<{ readonly message: string }> {}

export interface CatalogCacheShape {
  readonly read: (
    sourceUrl: string,
  ) => Effect.Effect<CatalogCacheEntry | undefined, CatalogCacheFailure>;
  /** Adapters must publish the complete entry atomically. */
  readonly write: (
    entry: CatalogCacheEntry,
  ) => Effect.Effect<void, CatalogCacheFailure>;
}

const copyEntry = (entry: CatalogCacheEntry): CatalogCacheEntry => ({
  ...entry,
  bytes: new Uint8Array(entry.bytes),
});

export class CatalogCache extends Context.Service<
  CatalogCache,
  CatalogCacheShape
>()("CatalogCache") {
  /** A deterministic, runtime-neutral cache for tests and controlled fixtures. */
  static readonly memory = Layer.effect(
    this,
    Effect.gen(function* () {
      const entries = yield* Ref.make(new Map<string, CatalogCacheEntry>());
      return {
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
      } satisfies CatalogCacheShape;
    }),
  );
}
