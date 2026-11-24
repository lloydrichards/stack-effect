import { StackConfig } from "@repo/domain/StackConfig";
import { Context, Effect, FileSystem, Layer, Schema } from "effect";

export { StackConfig };

export const CONFIG_FILENAME = "stack.effect.json" as const;

class MissingConfigError extends Schema.TaggedError<MissingConfigError>()(
  "MissingConfigError",
  { path: Schema.String },
) {
  override get message(): string {
    return `No ${CONFIG_FILENAME} found at ${this.path}. Run 'stack-effect init' first.`;
  }
}

class MalformedConfigError extends Schema.TaggedError<MalformedConfigError>()(
  "MalformedConfigError",
  { path: Schema.String, cause: Schema.Defect() },
) {
  override get message(): string {
    return `Invalid ${CONFIG_FILENAME} at ${this.path}`;
  }
}

class ConfigFileError extends Schema.TaggedError<ConfigFileError>()(
  "ConfigFileError",
  { path: Schema.String, cause: Schema.Defect() },
) {
  override get message(): string {
    return `Could not read ${CONFIG_FILENAME} at ${this.path}`;
  }
}

export class ConfigureService extends Context.Service<ConfigureService>()(
  "ConfigureService",
  {
    make: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      const configPath = (repositoryRoot: string) =>
        `${repositoryRoot}/${CONFIG_FILENAME}`;

      const readConfig = (repositoryRoot: string) =>
        Effect.gen(function* () {
          const location = configPath(repositoryRoot);
          const raw = yield* fs
            .readFileString(location)
            .pipe(
              Effect.mapError((error) =>
                error.reason._tag === "NotFound"
                  ? new MissingConfigError({ path: location })
                  : new ConfigFileError({ path: location, cause: error }),
              ),
            );
          return yield* Schema.decodeEffect(Schema.fromJsonString(StackConfig))(
            raw,
          ).pipe(
            Effect.mapError(
              (error) =>
                new MalformedConfigError({ path: location, cause: error }),
            ),
          );
        });

      const writeConfig = (repositoryRoot: string, config: StackConfig) =>
        Effect.gen(function* () {
          const json = yield* Schema.encodeEffect(
            Schema.fromJsonString(StackConfig, { space: 2 }),
          )(config);
          yield* fs.makeDirectory(repositoryRoot, { recursive: true });
          yield* fs.writeFileString(configPath(repositoryRoot), `${json}\n`);
        });

      const requireConfig = readConfig;

      return { configPath, readConfig, writeConfig, requireConfig } as const;
    }),
  },
) {
  static layer = Layer.effect(ConfigureService, ConfigureService.make);
}
