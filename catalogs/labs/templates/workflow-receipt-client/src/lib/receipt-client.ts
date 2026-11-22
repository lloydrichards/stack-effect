import type { ReceiptExecutionId, ReceiptId } from "@repo/domain/Receipt";
import { ReceiptApi } from "@repo/domain/ReceiptApi";
import { Effect, Schedule } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";

const client = HttpApiClient.make(ReceiptApi, {
  baseUrl: import.meta.env["VITE_SERVER_URL"] || "http://localhost:9000",
}).pipe(
  Effect.provideService(HttpClient.TracerPropagationEnabled, false),
  Effect.provide(FetchHttpClient.layer),
);

export const startReceipt = Effect.fn("ReceiptClient.start")(function* (
  receiptId: ReceiptId,
) {
  const api = yield* client;
  const { executionId } = yield* api.receipts.start({ payload: { receiptId } });
  return executionId;
});

export const awaitReceipt = Effect.fn("ReceiptClient.await")(function* (
  executionId: ReceiptExecutionId,
) {
  const api = yield* client;
  return yield* api.receipts.status({ params: { executionId } }).pipe(
    Effect.repeat({
      schedule: Schedule.spaced("500 millis"),
      until: (status) => status._tag !== "Pending",
    }),
    Effect.timeout("30 seconds"),
  );
});
