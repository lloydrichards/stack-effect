import { homedir } from "node:os";
import {
  type CatalogCacheEntry,
  CatalogCacheFailure,
} from "@repo/domain/CatalogSource";
import { CatalogCache } from "@repo/scaffold/CatalogCache";
import {
  Config,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from "effect";
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";

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
      const crypto = yield* Digest.Digest;
      const random = yield* SecureRandom.SecureRandom;
      const root = directory ?? (yield* defaultCacheRoot(path));

      const entryPath = Effect.fn("FileCatalogCache.entryPath")(function* (
        sourceUrl: string,
      ) {
        const hash = yield* crypto.digestHex(
          Digest.sha256,
          new TextEncoder().encode(sourceUrl),
        );
        return path.join(root, `${hash}.json`);
      });

      const fail = (message: string, cause: unknown) =>
        new CatalogCacheFailure({ message, cause });

      const read = Effect.fn("FileCatalogCache.read")(function* (
        sourceUrl: string,
      ) {
        const location = yield* entryPath(sourceUrl);
        const json = yield* fs.readFileString(location).pipe(
          Effect.catchIf(
            (error) => error.reason._tag === "NotFound",
            () => Effect.as(Effect.void, undefined),
          ),
          Effect.mapError((cause) =>
            fail(`Could not read catalog cache at ${location}.`, cause),
          ),
        );
        if (json === undefined) return undefined;
        const stored = yield* Schema.decodeEffect(StoredJson)(json).pipe(
          Effect.mapError((cause) =>
            fail(`Invalid catalog cache at ${location}.`, cause),
          ),
        );
        const { bytes, ...metadata } = stored;
        return {
          ...metadata,
          bytes: Uint8Array.from(Buffer.from(bytes, "base64")),
        } satisfies CatalogCacheEntry;
      });

      const write = Effect.fn("FileCatalogCache.write")(function* (
        entry: CatalogCacheEntry,
      ) {
        const location = yield* entryPath(entry.sourceUrl);
        const nonce = yield* random.randomBytes(8);
        const temporary = `${location}.${toHex(nonce)}.tmp`;
        const json = yield* Schema.encodeEffect(StoredJson)({
          ...entry,
          bytes: Buffer.from(entry.bytes).toString("base64"),
        }).pipe(
          Effect.mapError((cause) =>
            fail("Could not encode catalog cache entry.", cause),
          ),
        );
        yield* Effect.gen(function* () {
          yield* fs.makeDirectory(root, { recursive: true });
          yield* fs.writeFileString(temporary, json);
          yield* fs.rename(temporary, location);
        }).pipe(
          Effect.mapError((cause) =>
            fail(`Could not write catalog cache at ${location}.`, cause),
          ),
          Effect.onExit(() => fs.remove(temporary).pipe(Effect.ignore)),
        );
      });

      return CatalogCache.of({ read, write });
    }),
  );
