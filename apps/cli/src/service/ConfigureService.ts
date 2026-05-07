import { StackConfig } from "@repo/domain/Scaffold";
import { Context, Effect, FileSystem, Layer, Schema } from "effect";

export { StackConfig };

export const CONFIG_FILENAME = "stack.effect.json" as const;

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
          const json = yield* Schema.encodeEffect(
            Schema.fromJsonString(StackConfig),
          )(config);
          yield* fs.makeDirectory(repoRoot, { recursive: true });
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
