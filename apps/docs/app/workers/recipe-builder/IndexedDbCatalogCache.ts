import {
  type CatalogCacheEntry,
  CatalogCacheError,
} from "@repo/domain/Catalog";
import { CatalogCache } from "@repo/scaffold/Catalog";
import { Effect, Layer } from "effect";

const databaseName = "stack-effect-catalog";
const storeName = "documents";
const failure = (message: string, cause: unknown) =>
  new CatalogCacheError({ message, cause });

const openDatabase = Effect.callback<IDBDatabase, CatalogCacheError>(
  (resume) => {
    try {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore(storeName);
      request.onsuccess = () => resume(Effect.succeed(request.result));
      request.onerror = () =>
        resume(
          Effect.fail(
            failure("Could not open the browser catalog cache.", request.error),
          ),
        );
    } catch (cause) {
      resume(
        Effect.fail(failure("Browser catalog storage is unavailable.", cause)),
      );
    }
  },
);

const withDatabase = <A>(
  use: (database: IDBDatabase) => Effect.Effect<A, CatalogCacheError>,
) =>
  Effect.acquireUseRelease(openDatabase, use, (database) =>
    Effect.sync(() => database.close()),
  );

const read = (sourceUrl: string) =>
  withDatabase((database) =>
    Effect.callback<CatalogCacheEntry | undefined, CatalogCacheError>(
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
              Effect.fail(
                failure(
                  "Could not read the browser catalog cache.",
                  request.error,
                ),
              ),
            );
          transaction.onabort = () =>
            resume(
              Effect.fail(
                failure(
                  "Browser catalog cache read was aborted.",
                  transaction.error,
                ),
              ),
            );
        } catch (cause) {
          resume(
            Effect.fail(
              failure("Could not read the browser catalog cache.", cause),
            ),
          );
        }
      },
    ),
  );

const write = (entry: CatalogCacheEntry) =>
  withDatabase((database) =>
    Effect.callback<void, CatalogCacheError>((resume) => {
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
            Effect.fail(
              failure(
                "Could not write the browser catalog cache.",
                transaction.error,
              ),
            ),
          );
        transaction.onabort = () =>
          resume(
            Effect.fail(
              failure(
                "Browser catalog cache write was aborted.",
                transaction.error,
              ),
            ),
          );
      } catch (cause) {
        resume(
          Effect.fail(
            failure("Could not write the browser catalog cache.", cause),
          ),
        );
      }
    }),
  );

export const IndexedDbCatalogCache = Layer.succeed(
  CatalogCache,
  CatalogCache.of({ read, write }),
);
