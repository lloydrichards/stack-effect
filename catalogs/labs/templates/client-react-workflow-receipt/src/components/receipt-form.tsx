import { Effect } from "effect";
import { type FormEvent, useEffect, useState } from "react";
import {
  awaitReceipt,
  savedExecutionId,
  saveExecutionId,
  startReceipt,
} from "../lib/receipt-client";

export function ReceiptForm() {
  const [receiptId, setReceiptId] = useState("");
  const [executionId, setExecutionId] = useState(savedExecutionId);
  const [status, setStatus] = useState(executionId ? "Pending" : "");
  const [busy, setBusy] = useState(executionId !== null);

  useEffect(() => {
    if (executionId === null) return;
    const controller = new AbortController();

    void Effect.runPromise(awaitReceipt(executionId), {
      signal: controller.signal,
    }).then(
      (result) => {
        setStatus(
          result._tag === "Confirmed"
            ? `Confirmed ${result.receiptId}`
            : "Receipt failed.",
        );
        setBusy(false);
      },
      () => {
        if (controller.signal.aborted) return;
        setStatus("Could not check status. Refresh to try again.");
        setBusy(false);
      },
    );

    return () => controller.abort();
  }, [executionId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || receiptId.trim() === "") return;
    setBusy(true);
    setStatus("Starting receipt…");
    setExecutionId(null);

    void Effect.runPromise(startReceipt(receiptId.trim())).then(
      (id) => {
        saveExecutionId(id);
        setStatus("Pending");
        setExecutionId(id);
      },
      () => {
        setStatus("Could not start the receipt. Try again.");
        setBusy(false);
      },
    );
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
          disabled={busy || receiptId.trim() === ""}
        >
          Start receipt
        </button>
      </form>
      <p className="mt-4" role="status">
        {status}
      </p>
      {executionId && (
        <code className="block break-all text-xs">{executionId}</code>
      )}
    </section>
  );
}
