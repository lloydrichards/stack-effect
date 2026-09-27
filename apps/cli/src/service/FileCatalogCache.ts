import { homedir } from "node:os";
import {
  CatalogCache,
  CatalogCacheFailure,
  type CatalogCacheEntry,
  type CatalogCacheShape,
} from "@repo/scaffold";
import {
  Config,
  Crypto,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from "effect";

const StoredEntry = Schema.Struct({
  sourceUrl: Schema.String,
  bytes: Schema.String,
  digest: Schema.String,
  etag: Schema.optional(Schema.String),
  lastModified: Schema.optional(Schema.String),
  validatedAt: Schema.Finite,
});
const StoredJson = Schema.fromJsonString(StoredEntry);

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const defaultCacheRoot = Effect.fn("FileCatalogCache.defaultRoot")(function* (
  path: typeof Path.Path.Service,
) {
  const userHome = homedir();
  const localAppData = yield* Config.option(Config.String("LOCALAPPDATA"));
  const xdgCacheHome = yield* Config.option(Config.String("XDG_CACHE_HOME"));
  const base =
    process.platform === "win32"
      ? Option.getOrElse(localAppData, () =>
          path.join(userHome, "AppData", "Local"),
        )
      : Option.getOrElse(xdgCacheHome, () =>
          process.platform === "darwin"
            ? path.join(userHome, "Library", "Caches")
            : path.join(userHome, ".cache"),
        );
  return path.join(base, "stack-effect", "registry");
});

export const fileCatalogCacheLayer = (directory?: string) =>
  Layer.effect(
    CatalogCache,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;
      const root = directory ?? (yield* defaultCacheRoot(path));

      const entryPath = Effect.fn("FileCatalogCache.entryPath")(function* (
        sourceUrl: string,
      ) {
        const hash = yield* crypto
          .digest("SHA-256", new TextEncoder().encode(sourceUrl))
          .pipe(
            Effect.mapError(
              () =>
                new CatalogCacheFailure({
                  message: "Could not locate catalog cache entry.",
                }),
            ),
          );
        return path.join(root, `${toHex(hash)}.json`);
      });

      const fail = (message: string) => new CatalogCacheFailure({ message });

      const read = Effect.fn("FileCatalogCache.read")(function* (
        sourceUrl: string,
      ) {
        const location = yield* entryPath(sourceUrl);
        const json = yield* fs.readFileString(location).pipe(
          Effect.catchIf(
            (error) => error.reason._tag === "NotFound",
            () => Effect.as(Effect.void, undefined),
          ),
          Effect.mapError(() =>
            fail(`Could not read catalog cache at ${location}.`),
          ),
        );
        if (json === undefined) return undefined;
        const stored = yield* Schema.decodeEffect(StoredJson)(json).pipe(
          Effect.mapError(() => fail(`Invalid catalog cache at ${location}.`)),
        );
        return {
          sourceUrl: stored.sourceUrl,
          bytes: Uint8Array.from(Buffer.from(stored.bytes, "base64")),
          digest: stored.digest,
          validatedAt: stored.validatedAt,
          ...(stored.etag === undefined ? {} : { etag: stored.etag }),
          ...(stored.lastModified === undefined
            ? {}
            : { lastModified: stored.lastModified }),
        } satisfies CatalogCacheEntry;
      });

      const write = Effect.fn("FileCatalogCache.write")(function* (
        entry: CatalogCacheEntry,
      ) {
        const location = yield* entryPath(entry.sourceUrl);
        const nonce = yield* crypto
          .randomBytes(8)
          .pipe(
            Effect.mapError(() =>
              fail("Could not create a catalog cache temporary file."),
            ),
          );
        const temporary = `${location}.${toHex(nonce)}.tmp`;
        const json = yield* Schema.encodeEffect(StoredJson)({
          ...entry,
          bytes: Buffer.from(entry.bytes).toString("base64"),
        }).pipe(
          Effect.mapError(() => fail("Could not encode catalog cache entry.")),
        );
        yield* Effect.gen(function* () {
          yield* fs.makeDirectory(root, { recursive: true });
          yield* fs.writeFileString(temporary, json);
          yield* fs.rename(temporary, location);
        }).pipe(
          Effect.mapError(() =>
            fail(`Could not write catalog cache at ${location}.`),
          ),
          Effect.onExit(() => fs.remove(temporary).pipe(Effect.ignore)),
        );
      });

      return { read, write } satisfies CatalogCacheShape;
    }),
  );
