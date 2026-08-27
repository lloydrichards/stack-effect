import { StackConfig } from "@repo/domain/Scaffold";
import { Context, Effect, FileSystem, Layer, Schema } from "effect";

export { StackConfig };

export const CONFIG_FILENAME = "stack.effect.json" as const;

const formatCanonicalJson = (value: unknown, depth = 0): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  const indent = "  ".repeat(depth);
  const childIndent = "  ".repeat(depth + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((entry) => `${childIndent}${formatCanonicalJson(entry, depth + 1)}`).join(",\n")}\n${indent}]`;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return "{}";
  if (entries.every(([, entry]) => entry === null || typeof entry !== "object"))
    return `{ ${entries.map(([key, entry]) => `${JSON.stringify(key)}: ${formatCanonicalJson(entry, depth + 1)}`).join(", ")} }`;

  return `{\n${entries
    .map(
      ([key, entry]) =>
        `${childIndent}${JSON.stringify(key)}: ${formatCanonicalJson(entry, depth + 1)}`,
    )
    .join(",\n")}\n${indent}}`;
};

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

      const serializeConfig = (config: typeof StackConfig.Type) =>
        Schema.encodeEffect(Schema.fromJsonString(StackConfig))(config).pipe(
          Effect.map(
            (encoded) => `${formatCanonicalJson(JSON.parse(encoded))}\n`,
          ),
        );

      const writeConfig = (repoRoot: string, config: typeof StackConfig.Type) =>
        Effect.gen(function* () {
          const json = yield* serializeConfig(config);
          yield* fs.makeDirectory(repoRoot, { recursive: true });
          yield* fs.writeFileString(configPath(repoRoot), json);
        });

      const writeConfigAtomic = (
        repoRoot: string,
        config: typeof StackConfig.Type,
      ) =>
        Effect.gen(function* () {
          const json = yield* serializeConfig(config);
          const destination = configPath(repoRoot);
          const temporary = `${destination}.transaction-temp`;
          yield* fs.makeDirectory(repoRoot, { recursive: true });
          yield* fs.writeFileString(temporary, json);
          yield* fs.rename(temporary, destination);
          return yield* readConfig(repoRoot);
        }).pipe(
          Effect.onError(() =>
            fs
              .remove(`${configPath(repoRoot)}.transaction-temp`, {
                force: true,
              })
              .pipe(Effect.orElseSucceed(() => undefined)),
          ),
        );

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

      return {
        configPath,
        readConfig,
        serializeConfig,
        writeConfig,
        writeConfigAtomic,
        requireConfig,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(ConfigureService, ConfigureService.make);
}
