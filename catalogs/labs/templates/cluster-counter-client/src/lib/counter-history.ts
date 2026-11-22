import { CounterHistory, type CounterState } from "@repo/domain/Counter";
import { Schema } from "effect";
import { counterBaseUrl } from "./counter-client";

const key = `stack-effect:cluster-counter-history:${encodeURIComponent(counterBaseUrl)}`;

type Rows = typeof CounterHistory.Type;
type Counter = typeof CounterState.Type;

const JsonRows = Schema.fromJsonString(CounterHistory);
const decode = Schema.decodeUnknownOption(JsonRows);
const encode = Schema.encodeOption(JsonRows);

export function loadCounters(): Rows {
  try {
    const result = decode(
      localStorage.getItem(key) ?? "[]",
    );
    return result._tag === "Some" ? result.value : [];
  } catch {
    return [];
  }
}

export const upsertCounter = (rows: Rows, result: Counter): Rows =>
  rows.some((row) => row.id === result.id)
    ? rows.map((row) => (row.id === result.id ? result : row))
    : [...rows, result];

export function saveCounter(result: Counter) {
  try {
    const encoded = encode(upsertCounter(loadCounters(), result));
    if (encoded._tag === "Some") localStorage.setItem(key, encoded.value);
  } catch {
    // The list still works for the current page when storage is unavailable.
  }
}
