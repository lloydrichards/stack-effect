import type { CounterState } from "@repo/domain/Counter";
import { Effect } from "effect";
import { type FormEvent, useState } from "react";
import { counterError, incrementCounter } from "../lib/counter-client";
import {
  loadCounters,
  saveCounter,
  upsertCounter,
} from "../lib/counter-history";

export function CounterForm() {
  const [id, setId] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<typeof CounterState.Type>();
  const [error, setError] = useState("");
  const [counters, setCounters] = useState(loadCounters);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || id === "") return;
    setPending(true);
    setError("");
    void Effect.runPromise(
      incrementCounter(id).pipe(
        Effect.match({
          onSuccess: (counter) => {
            saveCounter(counter);
            setCounters((current) => upsertCounter(current, counter));
            setResult(counter);
          },
          onFailure: (failure) => {
            setResult(undefined);
            setError(counterError(failure));
          },
        }),
      ),
    ).finally(() => setPending(false));
  }

  return (
    <section className="rounded-lg border bg-card p-6 text-card-foreground">
      <h2 className="mb-4 font-semibold">Cluster counter</h2>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label htmlFor="counter-id">Counter ID</label>
        <input
          id="counter-id"
          className="rounded-md border bg-background p-2"
          value={id}
          onChange={(event) => setId(event.target.value)}
          required
        />
        <button
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          type="submit"
          disabled={pending || id === ""}
        >
          Increment counter
        </button>
      </form>
      <p className="mt-4 break-all" role="status">
        {pending
          ? "Incrementing…"
          : error || (result ? `${result.id}: ${result.count}` : "")}
      </p>
      <h3 className="mt-6 font-medium">Counter history</h3>
      <p className="mb-2 text-sm text-muted-foreground">
        Last values seen by this browser. A counter can change on the server.
      </p>
      {counters.length === 0 ? (
        <p className="text-sm">No counters yet.</p>
      ) : (
        <table aria-label="Counter history" className="w-full text-sm">
          <thead>
            <tr>
              <th scope="col" className="text-left">
                Counter ID
              </th>
              <th scope="col" className="text-right">
                Last value
              </th>
            </tr>
          </thead>
          <tbody>
            {counters.map((counter) => (
              <tr key={counter.id} className="border-t">
                <th
                  scope="row"
                  className="break-all py-2 pr-4 text-left font-medium"
                >
                  {counter.id}
                </th>
                <td className="py-2 text-right tabular-nums">
                  {counter.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
