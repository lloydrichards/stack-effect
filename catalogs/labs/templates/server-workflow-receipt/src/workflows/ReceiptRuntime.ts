// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Workflow.
import { ReceiptDatabaseLayer } from "@repo/db/ReceiptDatabase";
import { ClusterReceiptLayer } from "@repo/workflow/ReceiptRuntime";
import { Layer } from "effect";
import { Digest } from "effect/crypto";

export const ReceiptRuntimeLayer = ClusterReceiptLayer.pipe(
  Layer.provide([ReceiptDatabaseLayer, Digest.layerWebCrypto]),
  // Keep the workflow mailbox bound to its database when the counter runner is also installed.
  Layer.fresh,
);
