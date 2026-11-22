# Query an item through GraphQL

From this server directory, run `bun run dev`. With the default port, send a query with an ID variable.

```bash
curl http://localhost:9000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"query Find($id: ID!) { item(id: $id) { id name } }","variables":{"id":"demo"}}'
```

The server returns `{"data":{"item":{"id":"demo","name":"Demo item"}}}`. Change the ID to `missing` to see HTTP 200 with a null item and the field error code `ITEM_NOT_FOUND`. Send a malformed query or request body to see HTTP 400. The original health route is still at `GET /`.

The domain defines `CatalogItem` and `CatalogItemNotFound`. The `CatalogItems` service owns lookup behavior and its in-memory layer supplies the demo item. The GraphQL schema delegates to the service and translates missing items into field errors. The HTTP route reads the JSON request, runs GraphQL.js, and sends the result.

To look up real items, replace `CatalogItemsMemory` in the server's `RouterDependencies` with a layer that implements the same service. The resolver and GraphQL schema can stay the same. Use the same seam to inject a fixture service in a test.
