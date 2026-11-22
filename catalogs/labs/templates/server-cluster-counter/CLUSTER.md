# Cluster counter

The counter adds `POST /counters/:id/increment` to this server. Start the server with `{{#if runtime=deno}}deno task counter:serve{{/if}}{{#if runtime=bun}}bun run dev{{/if}}{{#if runtime=node}}{{runCommand}} dev{{/if}}` from this directory. With the default port, try these requests against a fresh server.

```bash
curl -X POST http://localhost:9000/counters/a/increment  # {"id":"a","count":1}
curl -X POST http://localhost:9000/counters/a/increment  # {"id":"a","count":2}
curl -X POST http://localhost:9000/counters/b/increment  # {"id":"b","count":1}
```

The domain package defines the ID and count schemas in `Counter.ts` and the HTTP contract in `CounterApi.ts`. The optional CLI uses that contract to call the server. The HTTP handler in `src/api/Counter.ts` uses `CounterEntity.client` to address an entity by ID. Cluster starts a handler for each active ID, so the `Ref` allocated in `src/cluster/Counter.ts` belongs to that ID.

`src/cluster/Runner.ts` registers the entities and supplies a local `SingleRunner` inside the HTTP server. The runner uses its own in-memory SQLite database and Web Crypto Digest for message storage. The example uses transient RPC calls. The count lives in memory and starts from zero when an idle entity is recreated or the server restarts.

## Try the CLI

From the CLI app directory, increment a counter with `{{#if runtime=bun}}bun src/index.ts{{/if}}{{#if runtime=node}}node --import tsx src/index.ts{{/if}}{{#if runtime=deno}}deno run --allow-env --allow-net src/index.ts{{/if}} counter a`. Set `COUNTER_SERVER_URL` if the server uses a different base URL.

{{#if runtime=deno}}The generated `counter:serve` task gives SQLite the FFI permission it needs. Use this task to start the counter server.

{{/if}}## Try the browser clients

Select `client-react-cluster-counter` or `client-foldkit-cluster-counter` to add a form to the corresponding client. Start the server from this directory with both client origins allowed.

```bash
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5174 {{#if runtime=deno}}deno task counter:serve{{/if}}{{#if runtime=bun}}bun run dev{{/if}}{{#if runtime=node}}{{runCommand}} dev{{/if}}
```

Run `{{runCommand}} dev` from each selected client directory. Open React at port 3000 or Foldkit at port 5174. Enter an ID and click **Increment counter**. Use the same ID in either client to increment the same count. Enter a fresh ID to start at one.

Both forms use the same typed HTTP client helper and decode input with the domain's `CounterId` schema. React runs the request from its submit handler. Foldkit sends an increment command and updates its model from the result. Set `VITE_SERVER_URL` on the client if the API uses a different address.

## Extend the example

To read the current count, add a `Get` RPC to the entity and return `Ref.get(count)` from its handler. Add `GET /counters/:id` to the domain HTTP contract and forward it to that RPC from the server adapter.

To host a second entity, merge its registration layer with `CounterEntityLive` in `src/cluster/Runner.ts` so both use the same runner. For counts that survive restarts, give the entity a repository that stores each count by ID. Workflow is a follow-on for multi-step operations that should resume after interruption.

See [Effect's Cluster messaging walkthrough](https://effect.website/blog/module-of-the-week/cluster-messaging) for more on entity IDs and routing.
