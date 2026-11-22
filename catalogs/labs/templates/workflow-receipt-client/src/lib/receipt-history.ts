import {
  ReceiptExecutionId,
  ReceiptId,
  ReceiptStatus,
} from "@repo/domain/Receipt";
import { Schema } from "effect";

export const ReceiptRow = Schema.Struct({
  receiptId: ReceiptId,
  executionId: ReceiptExecutionId,
  status: Schema.Union([
    ReceiptStatus.cases.Pending.fields._tag,
    ReceiptStatus.cases.Confirmed.fields._tag,
    ReceiptStatus.cases.Failed.fields._tag,
  ]),
});
export type ReceiptRow = typeof ReceiptRow.Type;
const Rows = Schema.Array(ReceiptRow);
const JsonRows = Schema.fromJsonString(Rows);
const StoredRow = Schema.Struct({
  ...ReceiptRow.fields,
  status: Schema.Union([ReceiptRow.fields.status, Schema.Literal("Status unavailable")]),
});
const decode = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(StoredRow)));
const encode = Schema.encodeOption(JsonRows);
export const receiptHistoryKey = "stack-effect:receipt-history";
const legacyHistoryKey = "stack-effect-receipt-preview-history";

export function loadReceipts(): readonly ReceiptRow[] {
  try {
    const result = decode(
      localStorage.getItem(receiptHistoryKey) ??
        localStorage.getItem(legacyHistoryKey) ??
        "[]",
    );
    return result._tag === "Some"
      ? result.value.map((row): ReceiptRow => ({
          ...row,
          status: row.status === "Status unavailable" ? "Pending" : row.status,
        }))
      : [];
  } catch {
    return [];
  }
}

export function upsertReceipt(
  rows: readonly ReceiptRow[],
  row: ReceiptRow,
): readonly ReceiptRow[] {
  const existing = rows.find((item) => item.executionId === row.executionId);
  if (!existing) return [row, ...rows];
  if (existing.status !== "Pending" || row.status === "Pending") return rows;

  return rows.map((item) => item.executionId === row.executionId ? row : item);
}

export function saveReceipt(row: ReceiptRow): ReceiptRow {
  try {
    const stored = loadReceipts();
    const updated = upsertReceipt(stored, row);
    if (updated !== stored) {
      const encoded = encode(updated);
      if (encoded._tag === "Some") localStorage.setItem(receiptHistoryKey, encoded.value);
    }

    return updated.find((item) => item.executionId === row.executionId) ?? row;
  } catch {
    return row;
  }
}
