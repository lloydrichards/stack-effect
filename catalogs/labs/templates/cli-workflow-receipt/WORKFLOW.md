# Run and resume a receipt workflow

Run the commands from this CLI directory. The default mode uses the in-memory Workflow engine with a fake receipt store.

```bash
{{#if runtime=bun}}bun src/index.ts{{/if}}{{#if runtime=node}}node --import tsx src/index.ts{{/if}}{{#if runtime=deno}}deno task workflow:run{{/if}} workflow memory-demo
```

It prints `Recorded memory-demo`, waits five seconds, then prints `Confirmed memory-demo`.

## Resume in a new process

Use a fresh SQLite file. Keep the same file and receipt ID for both commands.

```bash
export DATABASE_FILE="$(mktemp -d)/workflow.sqlite"
{{#if runtime=bun}}bun src/index.ts{{/if}}{{#if runtime=node}}node --import tsx src/index.ts{{/if}}{{#if runtime=deno}}deno task workflow:run{{/if}} workflow durable-demo --mode suspend
# Recorded durable-demo
# Suspended durable-demo

sleep 6
{{#if runtime=bun}}bun src/index.ts{{/if}}{{#if runtime=node}}node --import tsx src/index.ts{{/if}}{{#if runtime=deno}}deno task workflow:run{{/if}} workflow durable-demo --mode resume
# Confirmed durable-demo
```

The first command exits after polling a persisted `Suspended` result. The wait becomes due while the CLI is stopped. The second command starts a new local runner and joins the same execution. It prints the confirmation without running `RecordReceipt` again. Run `resume` a second time to read the stored result.

{{#if runtime=deno}}The generated `workflow:run` task grants SQLite FFI access for the durable mode.

{{/if}}## Follow the wiring

- The workflow package defines a typed payload and result. The receipt ID is the idempotency key. The workflow records a receipt through the injected `Receipts` service, then waits before returning the ID. `inMemoryThreshold: 0` makes the five-second wait use the durable clock path with the Cluster engine.
- `src/workflows/ReceiptRuntime.ts` supplies the fake store for the memory engine. For restart, it uses `ClusterWorkflowEngine` with a local `SingleRunner`, SQLite message storage, and the Web Crypto Digest layer. Each CLI process starts its own runner, so run the commands in sequence.
- SQLite also holds the example's receipt table. The insert uses a primary key and `ON CONFLICT DO NOTHING` so a second attempt for the same ID leaves the receipt unchanged. The workflow engine separately persists completed activity results for replay.

See [Effect's Cluster Workflow walkthrough](https://effect.website/blog/module-of-the-week/cluster-workflow) for more on durable activities and clocks.
