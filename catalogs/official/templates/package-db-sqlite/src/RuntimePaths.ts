import { Config, ConfigProvider, Effect, FileSystem, Layer, Option, Path } from "effect";
import type { PlatformError } from "effect/PlatformError";

// Internal helper: the deployed module must retain a stack.effect.json ancestor.
export const resolveRuntimeAsset = (
  moduleUrl: URL,
  relativeAssetPath: string,
): Effect.Effect<string, Config.ConfigError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const modulePath = yield* path.fromFileUrl(moduleUrl);

    const findRoot = (
      directory: string,
    ): Effect.Effect<string, ConfigProvider.SourceError | PlatformError> =>
      Effect.suspend(() =>
        Effect.gen(function* () {
          const marker = path.join(directory, "stack.effect.json");
          const exists = yield* fs.exists(marker);

          if (exists) {
            const info = yield* fs.stat(marker);
            return info.type === "File"
              ? directory
              : yield* Effect.fail(
                  new ConfigProvider.SourceError({
                    message: `Project marker is not a file: ${marker}`,
                  }),
                );
          }

          const parent = path.dirname(directory);
          return parent === directory
            ? yield* Effect.fail(
                new ConfigProvider.SourceError({
                  message: "No ancestor stack.effect.json file was found.",
                }),
              )
            : yield* findRoot(parent);
        }),
      );

    const root = yield* findRoot(path.dirname(modulePath));
    return path.join(root, relativeAssetPath);
  }).pipe(
    Effect.mapError((cause) =>
      new Config.ConfigError(
        new ConfigProvider.SourceError({
          message:
            "Cannot resolve a default runtime asset. Keep a stack.effect.json file above the deployed module, or set DATABASE_FILE / MIGRATIONS_DIRECTORY to absolute paths explicitly.",
          cause,
        }),
      ),
    ),
  );

export const makeDatabaseConfig = (
  moduleUrl: URL,
  platform: Layer.Layer<FileSystem.FileSystem | Path.Path>,
): Config.Config<{ filename: string }> => Config.all({
  filename: Config.String("DATABASE_FILE").pipe(
    Config.option,
    Config.mapEffect((filename) =>
      Option.match(filename, {
        onSome: (filename) => Effect.succeed(filename),
        onNone: () =>
          resolveRuntimeAsset(moduleUrl, "data/app.sqlite").pipe(Effect.provide(platform)),
      }),
    ),
  ),
});

// Explicit migration directories must be absolute; defaults use the project marker.
export const makeMigrationsDirectoryConfig = (
  moduleUrl: URL,
  relativeMigrationPath: string,
  platform: Layer.Layer<FileSystem.FileSystem | Path.Path>,
): Config.Config<string> => Config.String("MIGRATIONS_DIRECTORY").pipe(
  Config.option,
  Config.mapEffect((directory) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return yield* Option.match(directory, {
        onNone: () => resolveRuntimeAsset(moduleUrl, relativeMigrationPath),
        onSome: (directory) =>
          path.isAbsolute(directory)
            ? Effect.succeed(directory)
            : Effect.fail(
                new Config.ConfigError(
                  new ConfigProvider.SourceError({
                    message:
                      "MIGRATIONS_DIRECTORY must be an absolute path. Set an absolute path to runtime-loadable migration assets, or omit it to use the project marker default.",
                  }),
                ),
              ),
      });
    }).pipe(Effect.provide(platform)),
  ),
);
