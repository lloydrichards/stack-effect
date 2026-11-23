import { Context, Effect, Layer, Ref, Schema } from "effect";

export type CatalogCacheEntry = {
  readonly sourceUrl: string;
  readonly bytes: Uint8Array;
  readonly digest: string;
  readonly etag?: string | undefined;
  readonly lastModified?: string | undefined;
  readonly validatedAt: number;
};

export class CatalogCacheFailure extends Schema.TaggedError<CatalogCacheFailure>()(
  "CatalogCacheFailure",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

const copyEntry = (entry: CatalogCacheEntry): CatalogCacheEntry => ({
  ...entry,
  bytes: new Uint8Array(entry.bytes),
});

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
  static readonly layerMemory = Layer.effect(
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
