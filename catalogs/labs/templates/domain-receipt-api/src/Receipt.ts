import { Schema } from "effect";

export const ReceiptId = Schema.NonEmptyString;
export const ReceiptExecutionId = Schema.NonEmptyString;

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
