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

export const loadReceipts = (): ReadonlyArray<ReceiptRow> => {
  let stored: string | null;
  try {
    stored =
      localStorage.getItem(receiptHistoryKey) ??
      localStorage.getItem(legacyHistoryKey);
  } catch {
    return [];
  }

  const result = decode(stored ?? "[]");
  return result._tag === "Some"
    ? result.value.map((row): ReceiptRow => ({
        ...row,
        status: row.status === "Status unavailable" ? "Pending" : row.status,
      }))
    : [];
};

export const upsertReceipt = (
  rows: ReadonlyArray<ReceiptRow>,
  row: ReceiptRow,
): ReadonlyArray<ReceiptRow> => {
  const existing = rows.find((item) => item.executionId === row.executionId);
  if (!existing) return [row, ...rows];
  if (existing.status !== "Pending" || row.status === "Pending") return rows;

  return rows.map((item) => item.executionId === row.executionId ? row : item);
};

export const saveReceipt = (row: ReceiptRow): ReceiptRow => {
  const stored = loadReceipts();
  const updated = upsertReceipt(stored, row);
  if (updated !== stored) {
    const encoded = encode(updated);
    if (encoded._tag === "Some") {
      try {
        localStorage.setItem(receiptHistoryKey, encoded.value);
      } catch {
        return row;
      }
    }
  }

  return updated.find((item) => item.executionId === row.executionId) ?? row;
};
