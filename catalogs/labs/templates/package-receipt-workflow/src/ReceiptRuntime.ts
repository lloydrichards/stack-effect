// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Workflow.
import { ReceiptWriteError } from "@repo/domain/Receipt";
import { Effect, Layer } from "effect";
import { ClusterWorkflowEngine, SingleRunner } from "effect/cluster";
import { SqlClient } from "effect/sql";
import { ReceiptLayer, Receipts } from "./Receipt.js";

const SqlReceipts = Layer.effect(
  Receipts,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* sql`CREATE TABLE IF NOT EXISTS workflow_receipts (id TEXT PRIMARY KEY)`;

    return {
      record: Effect.fn("SqlReceipts.record")((id: string) =>
        sql`INSERT INTO workflow_receipts (id) VALUES (${id}) ON CONFLICT (id) DO NOTHING`.pipe(
          Effect.asVoid,
          Effect.mapError(() => new ReceiptWriteError({ id })),
        ),
      ),
    };
  }),
);

const DurableEngine = ClusterWorkflowEngine.layer.pipe(
  Layer.provide(SingleRunner.layer({ runnerStorage: "memory" })),
);

export const ClusterReceiptLayer = ReceiptLayer.pipe(
  Layer.provideMerge(DurableEngine),
  Layer.provide(SqlReceipts),
);
