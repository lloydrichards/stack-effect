import type { CounterState } from "@repo/domain/Counter";
import { Effect } from "effect";
import { type FormEvent, useState } from "react";
import { counterError, incrementCounter } from "../lib/counter-client";

export function CounterForm() {
  const [id, setId] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<typeof CounterState.Type>();
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || id === "") return;
    setPending(true);
    setError("");
    void Effect.runPromise(
      incrementCounter(id).pipe(
        Effect.match({
          onSuccess: setResult,
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
    </section>
  );
}
