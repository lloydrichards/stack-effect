{{#if module=package-db-sqlite}}import { Config, ConfigProvider, Effect, Layer, Option } from "effect";
import { DatabaseConfig, SqliteLayer } from "./Database";

const ReceiptDatabaseConfig = Config.all({
  databaseFile: Config.String("WORKFLOW_DATABASE_FILE").pipe(Config.option),
});

const defaultReceiptDatabase = DatabaseConfig.pipe(
  Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Effect.map(({ filename }) =>
    filename.replace(/app\.sqlite$/, "receipt-workflow.sqlite"),
  ),
  Effect.mapError(
    (cause) =>
      new Config.ConfigError(
        new ConfigProvider.SourceError({
          message:
            "Cannot resolve the default receipt database. Set WORKFLOW_DATABASE_FILE to an absolute writable path.",
          cause,
        }),
      ),
  ),
);

const workflowDatabaseProvider = Effect.gen(function* () {
  const { databaseFile } = yield* ReceiptDatabaseConfig;
  const filename = yield* Option.match(databaseFile, {
    onSome: Effect.succeed,
    onNone: () => defaultReceiptDatabase,
  });

  return ConfigProvider.fromUnknown({ DATABASE_FILE: filename });
});

export const ReceiptDatabaseLayer = Layer.fresh(SqliteLayer).pipe(
  Layer.provide(
    ConfigProvider.layerAdd(workflowDatabaseProvider, { asPrimary: true }),
  ),
);
{{/if}}{{#if noModule=package-db-sqlite}}export { DatabaseLayer as ReceiptDatabaseLayer } from "./Migrations";
{{/if}}
