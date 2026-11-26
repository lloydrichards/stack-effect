// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Workflow.
import { ReceiptWriteError } from "@repo/domain/Receipt";
import { Effect, Layer } from "effect";
import { ClusterWorkflowEngine, SingleRunner } from "effect/cluster";
import { SqlClient } from "effect/sql";
import { ReceiptLayer, Receipts } from "./Receipt";

const SqlReceipts = Layer.effect(
  Receipts,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* sql`CREATE TABLE IF NOT EXISTS workflow_receipts (id TEXT PRIMARY KEY)`;

    return {
      record: (id) =>
        sql`INSERT INTO workflow_receipts (id) VALUES (${id}) ON CONFLICT (id) DO NOTHING`.pipe(
          Effect.asVoid,
          Effect.mapError((cause) => new ReceiptWriteError({ id, cause })),
          Effect.withSpan("SqlReceipts.record"),
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
