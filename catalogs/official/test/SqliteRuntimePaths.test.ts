import { NodeServices } from "@effect/platform-node";
import { assert, layer } from "@effect/vitest";
import { ConfigProvider, Effect, FileSystem, Path } from "effect";
import {
  makeDatabaseConfig,
  makeMigrationsDirectoryConfig,
  resolveRuntimeAsset,
} from "../templates/package-db-sqlite/src/RuntimePaths";

layer(NodeServices.layer)("SQLite runtime assets", (it) => {
  it.effect(
    "should resolve assets from the nearest project marker when the package is nested",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "sqlite-assets-",
        });
        const project = path.join(root, "space # percent% ü");
        const directory = path.join(project, "packages/storage/db/src");
        yield* fs.makeDirectory(directory, { recursive: true });
        yield* fs.writeFileString(path.join(root, "stack.effect.json"), "{}");
        yield* fs.writeFileString(
          path.join(project, "stack.effect.json"),
          "{}",
        );
        const url = yield* path.toFileUrl(path.join(directory, "Database.ts"));
        const provider = ConfigProvider.fromUnknown({});
        assert.deepStrictEqual(
          yield* makeDatabaseConfig(url, NodeServices.layer).parse(provider),
          { filename: path.join(project, "data/app.sqlite") },
        );
        assert.strictEqual(
          yield* makeMigrationsDirectoryConfig(
            url,
            "packages/storage/db/src/migrations",
            NodeServices.layer,
          ).parse(provider),
          path.join(project, "packages/storage/db/src/migrations"),
        );
      }),
  );

  it.effect(
    "should use explicit deployment paths when no project marker is available",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "sqlite-overrides-",
        });
        const url = yield* path.toFileUrl(path.join(root, "module.ts"));
        for (const filename of [
          path.join(root, "app.sqlite"),
          "./custom/app.sqlite",
          ":memory:",
        ]) {
          assert.deepStrictEqual(
            yield* makeDatabaseConfig(url, NodeServices.layer).parse(
              ConfigProvider.fromUnknown({ DATABASE_FILE: filename }),
            ),
            { filename },
          );
        }
        const config = makeMigrationsDirectoryConfig(
          url,
          "migrations",
          NodeServices.layer,
        );
        const directory = path.join(root, "migrations");
        assert.strictEqual(
          yield* config.parse(
            ConfigProvider.fromUnknown({ MIGRATIONS_DIRECTORY: directory }),
          ),
          directory,
        );
        const failure = yield* Effect.flip(
          config.parse(
            ConfigProvider.fromUnknown({
              MIGRATIONS_DIRECTORY: "relative/migrations",
            }),
          ),
        );
        assert.include(
          failure.message,
          "MIGRATIONS_DIRECTORY must be an absolute path",
        );
      }),
  );

  it.effect(
    "should fail explicitly when runtime assets have no usable project marker",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "sqlite-marker-",
        });
        const url = yield* path.toFileUrl(path.join(root, "module.ts"));
        const missing = yield* Effect.flip(resolveRuntimeAsset(url, "asset"));
        assert.include(
          missing.message,
          "Cannot resolve a default runtime asset",
        );
        yield* fs.makeDirectory(path.join(root, "stack.effect.json"));
        const invalid = yield* Effect.flip(resolveRuntimeAsset(url, "asset"));
        assert.include(
          String(invalid.cause.cause),
          "Project marker is not a file",
        );
      }),
  );
});
