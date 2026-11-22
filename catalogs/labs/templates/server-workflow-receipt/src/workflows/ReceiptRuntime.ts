// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Workflow.
import { DatabaseConfig, SqliteLive } from "@repo/db";
import { ClusterReceiptLive } from "@repo/workflow/ReceiptRuntime";
import { Config, ConfigProvider, Effect, Layer, Option } from "effect";
import { Digest } from "effect/crypto";

const ReceiptServerConfig = Config.all({
  databaseFile: Config.String("WORKFLOW_DATABASE_FILE").pipe(Config.option),
});

const defaultReceiptDatabase = DatabaseConfig.pipe(
  Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Effect.map(({ filename }) => filename.replace(/app\.sqlite$/, "receipt-workflow.sqlite")),
  Effect.mapError((cause) =>
    new Config.ConfigError(
      new ConfigProvider.SourceError({
        message: "Cannot resolve the default receipt database. Set WORKFLOW_DATABASE_FILE to an absolute writable path.",
        cause,
      }),
    ),
  ),
);

const workflowDatabaseProvider = Effect.gen(function* () {
  const { databaseFile } = yield* ReceiptServerConfig;
  const filename = yield* Option.match(databaseFile, {
    onSome: Effect.succeed,
    onNone: () => defaultReceiptDatabase,
  });

  return ConfigProvider.fromUnknown({ DATABASE_FILE: filename });
});

const WorkflowSqliteLive = Layer.fresh(SqliteLive).pipe(
  Layer.provide(ConfigProvider.layerAdd(workflowDatabaseProvider, { asPrimary: true })),
);

export const ReceiptRuntimeLive = ClusterReceiptLive.pipe(
  Layer.provide([WorkflowSqliteLive, Digest.layerWebCrypto]),
);
