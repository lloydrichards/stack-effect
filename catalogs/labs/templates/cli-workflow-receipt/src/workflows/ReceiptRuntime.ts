// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Workflow.
import { SqliteLive } from "@repo/db";
import { ReceiptLive, Receipts } from "@repo/workflow/Receipt";
import { ClusterReceiptLive } from "@repo/workflow/ReceiptRuntime";
import { Effect, Layer } from "effect";
import { Digest } from "effect/crypto";
import { WorkflowEngine } from "effect/workflow";

const MemoryReceipts = Layer.succeed(Receipts, {
  record: () => Effect.void,
});

export const MemoryReceiptLive = ReceiptLive.pipe(
  Layer.provideMerge(WorkflowEngine.layerMemory),
  Layer.provide(MemoryReceipts),
);

export const DurableReceiptLive = ClusterReceiptLive.pipe(
  Layer.provide([SqliteLive, Digest.layerWebCrypto]),
);
