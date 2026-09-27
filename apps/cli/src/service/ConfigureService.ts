import { StackConfig } from "@repo/domain/Scaffold";
import { Context, Data, Effect, FileSystem, Layer, Schema } from "effect";

export { StackConfig };

export const CONFIG_FILENAME = "stack.effect.json" as const;

export class MissingConfigError extends Data.TaggedError("MissingConfigError")<{
  readonly path: string;
}> {
  override get message(): string {
    return `No ${CONFIG_FILENAME} found at ${this.path}. Run 'stack-effect init' first.`;
  }
}

export class MalformedConfigError extends Data.TaggedError(
  "MalformedConfigError",
)<{
  readonly path: string;
  readonly detail: string;
}> {
  override get message(): string {
    return `Invalid ${CONFIG_FILENAME} at ${this.path}: ${this.detail}`;
  }
}

export class ConfigFileError extends Data.TaggedError("ConfigFileError")<{
  readonly path: string;
  readonly detail: string;
}> {
  override get message(): string {
    return `Could not read ${CONFIG_FILENAME} at ${this.path}: ${this.detail}`;
  }
}

export class ConfigureService extends Context.Service<ConfigureService>()(
  "ConfigureService",
  {
    make: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      const configPath = (repoRoot: string) => `${repoRoot}/${CONFIG_FILENAME}`;

      const readConfig = (repoRoot: string) =>
        Effect.gen(function* () {
          const location = configPath(repoRoot);
          const raw = yield* fs.readFileString(location).pipe(
            Effect.mapError((error) =>
              error.reason._tag === "NotFound"
                ? new MissingConfigError({ path: location })
                : new ConfigFileError({
                    path: location,
                    detail: error.message,
                  }),
            ),
          );
          return yield* Schema.decodeEffect(Schema.fromJsonString(StackConfig))(
            raw,
          ).pipe(
            Effect.mapError(
              (error) =>
                new MalformedConfigError({
                  path: location,
                  detail: error.message,
                }),
            ),
          );
        });

      const writeConfig = (repoRoot: string, config: typeof StackConfig.Type) =>
        Effect.gen(function* () {
          const json = yield* Schema.encodeEffect(
            Schema.fromJsonString(StackConfig, { space: 2 }),
          )(config);
          yield* fs.makeDirectory(repoRoot, { recursive: true });
          yield* fs.writeFileString(configPath(repoRoot), `${json}\n`);
        });

      const requireConfig = readConfig;

      return { configPath, readConfig, writeConfig, requireConfig } as const;
    }),
  },
) {
  static layer = Layer.effect(ConfigureService, ConfigureService.make);
}
