import { Context, Effect, FileSystem, Layer, Schema } from "effect";

export const CONFIG_FILENAME = "stack.config.json" as const;

export const StackConfig = Schema.Struct({
  name: Schema.NonEmptyString,
  packageManager: Schema.Literals(["bun", "pnpm", "npm"]),
  lint: Schema.optional(Schema.Literals(["biome"])),
  format: Schema.optional(Schema.Literals(["biome"])),
  test: Schema.optional(Schema.Literals(["vitest"])),
  monorepo: Schema.optional(Schema.Literals(["turbo"])),
});

export class ConfigureService extends Context.Service<ConfigureService>()(
  "ConfigureService",
  {
    make: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      const configPath = (repoRoot: string) => `${repoRoot}/${CONFIG_FILENAME}`;

      const readConfig = (repoRoot: string) =>
        Effect.gen(function* () {
          const raw = yield* fs.readFileString(configPath(repoRoot));
          return yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(StackConfig),
          )(raw);
        });

      const writeConfig = (repoRoot: string, config: typeof StackConfig.Type) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const json = yield* Schema.encodeEffect(
            Schema.fromJsonString(StackConfig),
          )(config);
          yield* fs.writeFileString(configPath(repoRoot), json);
        });

      const requireConfig = (repoRoot: string) =>
        readConfig(repoRoot).pipe(
          Effect.catch(() =>
            Effect.gen(function* () {
              yield* Effect.logError(
                `No ${CONFIG_FILENAME} found. Run 'stack-effect init' first.`,
              );
              return yield* Effect.die("Config not found");
            }),
          ),
        );

      return { configPath, readConfig, writeConfig, requireConfig } as const;
    }),
  },
) {
  static layer = Layer.effect(ConfigureService, ConfigureService.make);
}
