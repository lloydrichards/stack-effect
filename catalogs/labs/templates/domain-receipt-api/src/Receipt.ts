import { Schema } from "effect";

export const ReceiptId = Schema.NonEmptyString.pipe(Schema.brand("ReceiptId"));
export type ReceiptId = typeof ReceiptId.Type;
export const ReceiptExecutionId = Schema.NonEmptyString.pipe(
  Schema.brand("ReceiptExecutionId"),
);
export type ReceiptExecutionId = typeof ReceiptExecutionId.Type;

export class ReceiptWriteError extends Schema.TaggedError<
  ReceiptWriteError,
  { readonly brand: unique symbol }
>()("ReceiptWriteError", { id: ReceiptId }) {}

export const ReceiptStatus = Schema.TaggedUnion({
  Pending: {},
  Confirmed: { receiptId: ReceiptId },
  Failed: {},
});
export type ReceiptStatus = typeof ReceiptStatus.Type;
