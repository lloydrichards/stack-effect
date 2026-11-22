// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Workflow.
import { ReceiptId, ReceiptWriteError } from "@repo/domain/Receipt";
import { Console, Context, Effect, Layer } from "effect";
import { Activity, DurableClock, Workflow } from "effect/workflow";

export class Receipts extends Context.Service<
  Receipts,
  { readonly record: (id: string) => Effect.Effect<void, ReceiptWriteError> }
>()("example/Receipts") {}

export const Receipt = Workflow.make("Receipt", {
  payload: { id: ReceiptId },
  idempotencyKey: ({ id }) => id,
  success: ReceiptId,
  error: ReceiptWriteError,
});

export const ReceiptLive = Layer.unwrap(
  Effect.gen(function* () {
    const receipts = yield* Receipts;

    return Receipt.toLayer(
      Effect.fn("Receipt.run")(function* ({ id }) {
        yield* Activity.make({
          name: "RecordReceipt",
          error: ReceiptWriteError,
          execute: receipts
            .record(id)
            .pipe(Effect.tap(() => Console.log(`Recorded ${id}`))),
        });

        yield* DurableClock.sleep({
          name: "ConfirmReceipt",
          duration: "5 seconds",
          inMemoryThreshold: 0,
        });

        return id;
      }),
    );
  }),
);
