import { ReceiptExecutionId, ReceiptId, ReceiptStatus } from "@repo/domain/Receipt";
import { Schema } from "effect";

export const ReceiptRow = Schema.Struct({
  receiptId: ReceiptId,
  executionId: ReceiptExecutionId,
  status: Schema.Union([ReceiptStatus.cases.Pending.fields._tag, ReceiptStatus.cases.Confirmed.fields._tag, ReceiptStatus.cases.Failed.fields._tag, Schema.Literal("Status unavailable")]),
});
export type ReceiptRow = typeof ReceiptRow.Type;
const Rows = Schema.Array(ReceiptRow);
const JsonRows = Schema.fromJsonString(Rows);
const decode = Schema.decodeUnknownOption(JsonRows);
const encode = Schema.encodeOption(JsonRows);
export const receiptHistoryKey = "stack-effect:receipt-history";
const legacyHistoryKey = "stack-effect-receipt-preview-history";

export function loadReceipts(): readonly ReceiptRow[] {
  try {
    const result = decode(localStorage.getItem(receiptHistoryKey) ?? localStorage.getItem(legacyHistoryKey) ?? "[]");
    return result._tag === "Some" ? result.value : [];
  } catch {
    return [];
  }
}

export function upsertReceipt(
  rows: readonly ReceiptRow[],
  row: ReceiptRow,
): readonly ReceiptRow[] {
  return rows.some((item) => item.executionId === row.executionId)
    ? rows.map((item) => (item.executionId === row.executionId ? row : item))
    : [row, ...rows];
}

export function saveReceipt(row: ReceiptRow) {
  try {
    const encoded = encode(upsertReceipt(loadReceipts(), row));
    if (encoded._tag === "Some")
      localStorage.setItem(receiptHistoryKey, encoded.value);
  } catch {
    // The list still works for the current page when storage is unavailable.
  }
}
