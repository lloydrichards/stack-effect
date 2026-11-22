// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Workflow.
import { SqliteLive } from "@repo/db";
import { ReceiptLive, Receipts } from "@repo/workflow/Receipt";
import { ClusterReceiptLive } from "@repo/workflow/ReceiptRuntime";
import { Config, ConfigProvider, Effect, Layer, Option } from "effect";
import { Digest } from "effect/crypto";
import { WorkflowEngine } from "effect/workflow";

const ReceiptCliConfig = Config.all({
  databaseFile: Config.String("RECEIPT_CLI_DATABASE_FILE").pipe(Config.option),
  legacyDatabaseFile: Config.String("DATABASE_FILE").pipe(Config.option),
});

const ReceiptCliSqliteLive = Layer.fresh(SqliteLive).pipe(
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

export const MemoryReceiptLive = ReceiptLive.pipe(
  Layer.provideMerge(WorkflowEngine.layerMemory),
  Layer.provide(MemoryReceipts),
);

export const DurableReceiptLive = ClusterReceiptLive.pipe(
  Layer.provide([ReceiptCliSqliteLive, Digest.layerWebCrypto]),
);
