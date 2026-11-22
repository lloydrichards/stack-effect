# Cluster counter

The counter adds `POST /counters/:id/increment` to this server. Start the server with `bun run dev` from this directory. With the default port, try these requests against a fresh server.

```bash
curl -X POST http://localhost:9000/counters/a/increment  # {"id":"a","count":1}
curl -X POST http://localhost:9000/counters/a/increment  # {"id":"a","count":2}
curl -X POST http://localhost:9000/counters/b/increment  # {"id":"b","count":1}
```

The domain package defines the ID and count schemas in `Counter.ts` and the HTTP contract in `CounterApi.ts`. The optional CLI uses that contract to call the server. The HTTP handler in `src/api/Counter.ts` uses `CounterEntity.client` to address an entity by ID. Cluster starts a handler for each active ID, so the `Ref` allocated in `src/cluster/Counter.ts` belongs to that ID.

`src/cluster/Runner.ts` registers the entities and supplies a local `SingleRunner` inside the HTTP server. The runner needs SQLite and Digest for its message storage. The example uses transient RPC calls. The count lives in memory and starts from zero when an idle entity is recreated or the server restarts.

## Extend the example

To read the current count, add a `Get` RPC to the entity and return `Ref.get(count)` from its handler. Add `GET /counters/:id` to the domain HTTP contract and forward it to that RPC from the server adapter.

To host a second entity, merge its registration layer with `CounterEntityLive` in `src/cluster/Runner.ts` so both use the same runner. For counts that survive restarts, give the entity a repository that stores each count by ID. Workflow is a follow-on for multi-step operations that should resume after interruption.

See [Effect's Cluster messaging walkthrough](https://effect.website/blog/module-of-the-week/cluster-messaging) for more on entity IDs and routing.
