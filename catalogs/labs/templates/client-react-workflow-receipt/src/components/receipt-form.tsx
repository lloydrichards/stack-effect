import { Effect } from "effect";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { awaitReceipt, startReceipt } from "../lib/receipt-client";
import {
  loadReceipts,
  receiptHistoryKey,
  type ReceiptRow,
  saveReceipt,
  upsertReceipt,
} from "../lib/receipt-history";

function ReceiptStatusRow({
  row,
  onUpdate,
}: {
  row: ReceiptRow;
  onUpdate: (row: ReceiptRow) => void;
}) {
  useEffect(() => {
    if (row.status !== "Pending") return;
    const controller = new AbortController();
    void Effect.runPromise(awaitReceipt(row.executionId), {
      signal: controller.signal,
    }).then(
      (result) =>
        onUpdate({
          ...row,
          receiptId:
            result._tag === "Confirmed" ? result.receiptId : row.receiptId,
          status: result._tag === "Confirmed" ? "Confirmed" : "Failed",
        }),
      () => {
        if (!controller.signal.aborted)
          onUpdate({ ...row, status: "Status unavailable" });
      },
    );
    return () => controller.abort();
  }, [row, onUpdate]);

  return (
    <tr className="border-t align-top">
      <th scope="row" className="break-all py-2 pr-4 text-left font-medium">
        {row.receiptId}
        <code className="block break-all text-xs font-normal text-muted-foreground">
          {row.executionId}
        </code>
      </th>
      <td className="py-2" role="status">
        {row.status}
        {row.status === "Status unavailable" && (
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => onUpdate({ ...row, status: "Pending" })}
          >
            Retry
          </button>
        )}
      </td>
    </tr>
  );
}

export function ReceiptForm() {
  const [receiptId, setReceiptId] = useState("");
  const [rows, setRows] = useState(loadReceipts);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const updateRow = useCallback((row: ReceiptRow) => {
    saveReceipt(row);
    setRows((current) => upsertReceipt(current, row));
  }, []);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === receiptHistoryKey) setRows(loadReceipts());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = receiptId.trim();
    if (starting || !id) return;
    setError("");
    setStarting(true);
    void Effect.runPromise(startReceipt(id))
      .then(
        (executionId) => {
          if (!rows.some((row) => row.executionId === executionId)) {
            updateRow({ receiptId: id, executionId, status: "Pending" });
          }
          setReceiptId((current) => (current.trim() === id ? "" : current));
        },
        () => setError("Could not start the receipt. Try again."),
      )
      .finally(() => setStarting(false));
  }

  return (
    <section className="rounded-lg border bg-card p-6 text-card-foreground">
      <h2 className="mb-4 font-semibold">Receipt workflow</h2>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label htmlFor="receipt-id">Receipt ID</label>
        <input
          id="receipt-id"
          className="rounded-md border bg-background p-2"
          value={receiptId}
          onChange={(event) => setReceiptId(event.target.value)}
          required
        />
        <button
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          type="submit"
          disabled={starting || !receiptId.trim()}
        >
          {starting ? "Starting…" : "Start receipt"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3">
          {error}
        </p>
      )}
      <h3 className="mt-6 font-medium">Receipt history</h3>
      <p className="mb-2 text-sm text-muted-foreground">
        Submissions from this browser.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm">No receipts yet.</p>
      ) : (
        <div
          className="max-h-72 overflow-auto"
          tabIndex={0}
          aria-label="Scrollable receipt history"
        >
          <table
            aria-label="Receipt history"
            className="w-full table-fixed text-sm"
          >
            <thead>
              <tr>
                <th scope="col" className="w-2/3 text-left">
                  Receipt
                </th>
                <th scope="col" className="text-left">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ReceiptStatusRow
                  key={row.executionId}
                  row={row}
                  onUpdate={updateRow}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
