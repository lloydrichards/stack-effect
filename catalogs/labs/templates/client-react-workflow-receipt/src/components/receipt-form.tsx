import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { ReceiptId } from "@repo/domain/Receipt";
import { Effect, Match, Schema } from "effect";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { awaitReceipt, startReceipt } from "../lib/receipt-client";
import {
  loadReceipts,
  receiptHistoryKey,
  type ReceiptRow,
  saveReceipt,
  upsertReceipt,
} from "../lib/receipt-history";

const ReceiptStatusRow = ({
  row,
  onUpdate,
}: {
  row: ReceiptRow;
  onUpdate: (row: ReceiptRow) => void;
}) => {
  const [pollFailed, setPollFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { executionId, receiptId, status } = row;

  useEffect(() => {
    if (status !== "Pending") return;
    const controller = new AbortController();

    void Effect.runPromise(awaitReceipt(executionId), {
      signal: controller.signal,
    }).then(
      (result) => {
        if (controller.signal.aborted) return;
        onUpdate(
          Match.valueTags(result, {
            Confirmed: (confirmed): ReceiptRow => ({
              executionId,
              receiptId: confirmed.receiptId,
              status: "Confirmed",
            }),
            Failed: (): ReceiptRow => ({
              executionId,
              receiptId,
              status: "Failed",
            }),
          }),
        );
      },
      () => {
        if (!controller.signal.aborted) setPollFailed(true);
      },
    );

    return () => controller.abort();
  }, [attempt, executionId, receiptId, status, onUpdate]);

  const unavailable = status === "Pending" && pollFailed;

  return (
    <tr className="border-t align-top">
      <th scope="row" className="break-all py-2 pr-4 text-left font-medium">
        {row.receiptId}
        <code className="block break-all text-xs font-normal text-muted-foreground">
          {row.executionId}
        </code>
      </th>
      <td className="py-2" role="status">
        {unavailable ? "Status unavailable" : status}
        {unavailable && (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => {
              setPollFailed(false);
              setAttempt((current) => current + 1);
            }}
          >
            Retry
          </Button>
        )}
      </td>
    </tr>
  );
};

export const ReceiptForm = () => {
  const [receiptId, setReceiptId] = useState("");
  const [rows, setRows] = useState(loadReceipts);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const updateRow = useCallback((row: ReceiptRow) => {
    const saved = saveReceipt(row);
    setRows((current) => upsertReceipt(current, saved));
  }, []);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === receiptHistoryKey) {
        const stored = loadReceipts();
        setRows((current) => stored.reduce(upsertReceipt, current));
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = receiptId.trim();
    if (starting || !Schema.is(ReceiptId)(id)) return;
    setError("");
    setStarting(true);
    void Effect.runPromise(startReceipt(id))
      .then(
        (executionId) => {
          updateRow({ receiptId: id, executionId, status: "Pending" });
          setReceiptId((current) => (current.trim() === id ? "" : current));
        },
        () => setError("Could not start the receipt. Try again."),
      )
      .finally(() => setStarting(false));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receipt workflow</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <label htmlFor="receipt-id">Receipt ID</label>
          <Input
            id="receipt-id"
            value={receiptId}
            onChange={(event) => setReceiptId(event.target.value)}
            required
          />
          <Button type="submit" disabled={starting || !receiptId.trim()}>
            {starting ? "Starting…" : "Start receipt"}
          </Button>
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
      </CardContent>
    </Card>
  );
};
