// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Workflow.
import { ReceiptExecutionId, type ReceiptStatus } from "@repo/domain/Receipt";
import { ReceiptApi } from "@repo/domain/ReceiptApi";
import { Receipt } from "@repo/workflow/Receipt";
import { Effect, Exit, Layer, Match, Option } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { WorkflowEngine } from "effect/workflow";
import { ReceiptRuntimeLayer } from "../workflows/ReceiptRuntime";

const ReceiptHandlers = HttpApiBuilder.group(
  ReceiptApi,
  "receipts",
  (handlers) =>
    Effect.gen(function* () {
      const engine = yield* WorkflowEngine.WorkflowEngine;

      return handlers
        .handle("start", ({ payload }) =>
          Receipt.execute({ id: payload.receiptId }, { discard: true }).pipe(
            Effect.map((executionId) => ({
              executionId: ReceiptExecutionId.make(executionId),
            })),
            Effect.provideService(WorkflowEngine.WorkflowEngine, engine),
          ),
        )
        .handle("status", ({ params }) =>
          Receipt.poll(params.executionId).pipe(
            Effect.map((result): ReceiptStatus => {
              if (Option.isNone(result)) {
                return { _tag: "Pending" };
              }

              return Match.value(result.value).pipe(
                Match.tagsExhaustive({
                  Suspended: (): ReceiptStatus => ({ _tag: "Pending" }),
                  Complete: ({ exit }): ReceiptStatus =>
                    Exit.isSuccess(exit)
                      ? { _tag: "Confirmed", receiptId: exit.value }
                      : { _tag: "Failed" },
                }),
              );
            }),
            Effect.provideService(WorkflowEngine.WorkflowEngine, engine),
          ),
        );
    }),
);

export const ReceiptRoutes = HttpApiBuilder.layer(ReceiptApi).pipe(
  Layer.provide(ReceiptHandlers),
  Layer.provide(ReceiptRuntimeLayer),
);
