import {
  CatalogCache,
  CatalogCacheFailure,
  type CatalogCacheEntry,
  type CatalogCacheShape,
} from "@repo/scaffold/browser";
import { Effect, Layer } from "effect";

const databaseName = "stack-effect-catalog";
const storeName = "documents";
const failure = (message: string) => new CatalogCacheFailure({ message });

const openDatabase = Effect.callback<IDBDatabase, CatalogCacheFailure>(
  (resume) => {
    try {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore(storeName);
      request.onsuccess = () => resume(Effect.succeed(request.result));
      request.onerror = () =>
        resume(
          Effect.fail(failure("Could not open the browser catalog cache.")),
        );
    } catch {
      resume(Effect.fail(failure("Browser catalog storage is unavailable.")));
    }
  },
);

const withDatabase = <A>(
  use: (database: IDBDatabase) => Effect.Effect<A, CatalogCacheFailure>,
) =>
  Effect.acquireUseRelease(openDatabase, use, (database) =>
    Effect.sync(() => database.close()),
  );

const read = (sourceUrl: string) =>
  withDatabase((database) =>
    Effect.callback<CatalogCacheEntry | undefined, CatalogCacheFailure>(
      (resume) => {
        try {
          const transaction = database.transaction(storeName, "readonly");
          const request = transaction.objectStore(storeName).get(sourceUrl);
          request.onsuccess = () =>
            resume(
              Effect.succeed(request.result as CatalogCacheEntry | undefined),
            );
          request.onerror = () =>
            resume(
              Effect.fail(failure("Could not read the browser catalog cache.")),
            );
          transaction.onabort = () =>
            resume(
              Effect.fail(failure("Browser catalog cache read was aborted.")),
            );
        } catch {
          resume(
            Effect.fail(failure("Could not read the browser catalog cache.")),
          );
        }
      },
    ),
  );

const write = (entry: CatalogCacheEntry) =>
  withDatabase((database) =>
    Effect.callback<void, CatalogCacheFailure>((resume) => {
      try {
        const transaction = database.transaction(storeName, "readwrite");
        transaction
          .objectStore(storeName)
          .put(
            { ...entry, bytes: new Uint8Array(entry.bytes) },
            entry.sourceUrl,
          );
        transaction.oncomplete = () => resume(Effect.void);
        transaction.onerror = () =>
          resume(
            Effect.fail(failure("Could not write the browser catalog cache.")),
          );
        transaction.onabort = () =>
          resume(
            Effect.fail(failure("Browser catalog cache write was aborted.")),
          );
      } catch {
        resume(
          Effect.fail(failure("Could not write the browser catalog cache.")),
        );
      }
    }),
  );

export const IndexedDbCatalogCache = Layer.succeed(CatalogCache, {
  read,
  write,
} satisfies CatalogCacheShape);
