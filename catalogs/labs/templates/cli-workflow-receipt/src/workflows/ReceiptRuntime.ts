// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Workflow.
import { SqliteLayer } from "@repo/db";
import { ReceiptLayer, Receipts } from "@repo/workflow/Receipt";
import { ClusterReceiptLayer } from "@repo/workflow/ReceiptRuntime";
import { Config, ConfigProvider, Effect, Layer, Option } from "effect";
import { Digest } from "effect/crypto";
import { WorkflowEngine } from "effect/workflow";

const ReceiptCliConfig = Config.all({
  databaseFile: Config.String("RECEIPT_CLI_DATABASE_FILE").pipe(Config.option),
  legacyDatabaseFile: Config.String("DATABASE_FILE").pipe(Config.option),
});

const ReceiptCliSqliteLayer = Layer.fresh(SqliteLayer).pipe(
  Layer.provide(
    ConfigProvider.layerAdd(
      ReceiptCliConfig.pipe(
        Config.map(({ databaseFile, legacyDatabaseFile }) =>
          ConfigProvider.fromUnknown({
            DATABASE_FILE: Option.getOrElse(
              Option.orElse(databaseFile, () => legacyDatabaseFile),
              () => ".cache/receipt-cli.sqlite",
            ),
          }),
        ),
      ),
      { asPrimary: true },
    ),
  ),
);

const MemoryReceipts = Layer.succeed(Receipts, {
  record: () => Effect.void,
});

export const MemoryReceiptLayer = ReceiptLayer.pipe(
  Layer.provideMerge(WorkflowEngine.layerMemory),
  Layer.provide(MemoryReceipts),
);

export const DurableReceiptLayer = ClusterReceiptLayer.pipe(
  Layer.provide([ReceiptCliSqliteLayer, Digest.layerWebCrypto]),
);
