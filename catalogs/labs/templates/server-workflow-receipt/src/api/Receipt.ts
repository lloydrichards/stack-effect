// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Workflow.
import { ReceiptStatus } from "@repo/domain/Receipt";
import { ReceiptApi } from "@repo/domain/ReceiptApi";
import { Receipt } from "@repo/workflow/Receipt";
import { Effect, Exit, Layer, Option } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { WorkflowEngine } from "effect/workflow";

const ReceiptGroupLive = HttpApiBuilder.group(
  ReceiptApi,
  "receipts",
  (handlers) =>
    Effect.gen(function* () {
      const engine = yield* WorkflowEngine.WorkflowEngine;

      return handlers
        .handle("start", ({ payload }) =>
          Receipt.execute({ id: payload.receiptId }, { discard: true }).pipe(
            Effect.map((executionId) => ({ executionId })),
            Effect.provideService(WorkflowEngine.WorkflowEngine, engine),
          ),
        )
        .handle("status", ({ params }) =>
          Receipt.poll(params.executionId).pipe(
            Effect.map((result): ReceiptStatus => {
              if (Option.isNone(result) || result.value._tag === "Suspended") {
                return { _tag: "Pending" };
              }
              const exit = result.value.exit;
              return Exit.isSuccess(exit)
                ? { _tag: "Confirmed", receiptId: exit.value }
                : { _tag: "Failed" };
            }),
            Effect.provideService(WorkflowEngine.WorkflowEngine, engine),
          ),
        );
    }),
);

export const ReceiptApiLive = HttpApiBuilder.layer(ReceiptApi).pipe(
  Layer.provide(ReceiptGroupLive),
);
