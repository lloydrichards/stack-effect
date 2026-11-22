# Cluster counter

The counter adds `POST /counters/:id/increment` to this server. Start the server with `{{runCommand}} dev` from this directory. With the default port, try these requests against a fresh server.

```bash
curl -X POST http://localhost:9000/counters/a/increment  # {"id":"a","count":1}
curl -X POST http://localhost:9000/counters/a/increment  # {"id":"a","count":2}
curl -X POST http://localhost:9000/counters/b/increment  # {"id":"b","count":1}
```

The domain package defines the counter data in `Counter.ts`, the HTTP contract in `CounterApi.ts`, and the entity RPC in `CounterRpc.ts`. The optional CLI uses that contract to call the server. The HTTP handler in `src/api/Counter.ts` uses `CounterEntity.client` to address an entity by ID. Cluster starts a handler for each active ID, so the `Ref` allocated in `src/cluster/Counter.ts` belongs to that ID.

## Follow the runner setup

`src/cluster/Runner.ts` provides Effect's `SingleRunner` with a SQLite client and Web Crypto Digest. The runner starts in the HTTP server process. It uses SQL for runner coordination and for message and reply storage when an RPC opts into persistence. The default database is `.cache/cluster-counter.sqlite` relative to the server's working directory. Set `CLUSTER_DATABASE_FILE` to an absolute path to choose the same file across launch directories. The runner creates the parent directory and opens its own database file.

`Increment` uses a transient RPC. Its count is application state held in the entity's `Ref` and resets when the server restarts or the entity idles out. Add a counter repository keyed by ID if the count needs to survive those events. Use a persisted RPC if a request also needs durable delivery.

## Add the counter to an existing server

If Stack Effect reports a manifest conflict, skip the override to preserve custom entries. Override replaces the entire `package.json`. The `--yes` option skips conflicted files.

1. Add `"{{#if runtime=bun}}@effect/sql-sqlite-bun{{/if}}{{#if runtime=node}}@effect/sql-sqlite-node{{/if}}{{#if runtime=deno}}@effect/sql-sqlite-node{{/if}}": "4.1.4"` to the existing server dependencies.
{{#if runtime=deno}}2. Add `--allow-ffi` before the entry point in `dev`, `dev:watch`, and any `deno compile` command that lacks it.
{{/if}}3. Resolve any other conflicts reported by `stack-effect add`, then run the workspace's package install command.

## Try the CLI

From the CLI app directory, increment a counter with `{{#if runtime=bun}}bun src/index.ts{{/if}}{{#if runtime=node}}node --import tsx src/index.ts{{/if}}{{#if runtime=deno}}deno run --allow-env --allow-net src/index.ts{{/if}} counter a`. Set `COUNTER_SERVER_URL` if the server uses a different base URL.

## Try the browser clients

Select `client-react-cluster-counter` or `client-foldkit-cluster-counter` to add a form to the corresponding client. Start the server from this directory with both client origins allowed.

```bash
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5174 {{runCommand}} dev
```

Run `{{runCommand}} dev` from each selected client directory. Open React at port 3000 or Foldkit at port 5174. Enter an ID and click **Increment counter**. Use the same ID in either client to increment the same count. Enter a fresh ID to start at one.

The history table shows the last value this browser received for each ID. Reloading restores the table from browser storage. Increment an ID again to see its latest response from the server.

Both forms use the same typed HTTP client helper and decode input with the domain's `CounterId` schema. React runs the request from its submit handler. Foldkit sends an increment command and updates its model from the result. Set `VITE_SERVER_URL` on the client if the API uses a different address.

## Extend the example

To read the current count, define a `Get` RPC in `CounterRpc.ts`, register it on the entity, and return `Ref.get(count)` from its handler. Add `GET /counters/:id` to the domain HTTP contract and forward it to that RPC from the server adapter.

To host a second entity, merge its registration layer with `CounterEntityLive` in `src/cluster/Runner.ts` so both use the same runner. To run entities in separate processes, switch the runner wiring to an inter-runner transport and a shared SQL store such as PostgreSQL. Give each runner its own reachable address and verify that both can route messages to the shard owner. Keep the public HTTP routes and clients behind the same domain contract. Workflow uses Cluster when a multi-step operation should resume after interruption.

See [Effect's Cluster messaging walkthrough](https://effect.website/blog/module-of-the-week/cluster-messaging) for more on entity IDs and routing.
