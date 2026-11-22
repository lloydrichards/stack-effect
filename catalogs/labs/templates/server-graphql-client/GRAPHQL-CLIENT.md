# Look up an item through GraphQL

Run these in separate terminals from this server directory. The first runs a local upstream fixture on port 9010. The second starts the scaffolded HTTP server on port 9000.

```bash
{{#if runtime=bun}}bun run{{/if}}{{#if runtime=node}}pnpm run{{/if}}{{#if runtime=deno}}deno task{{/if}} fixture:graphql
```

```bash
{{#if runtime=bun}}bun run{{/if}}{{#if runtime=node}}pnpm run{{/if}}{{#if runtime=deno}}deno task{{/if}} dev
```

Try the lookup with `curl -i http://localhost:9000/upstream-items/demo`. The route sends the ID as a typed GraphQL variable and returns `{"id":"demo","name":"Demo item"}`. Replace `demo` with the IDs below to exercise the failure paths.

| ID              | Fixture response                  | Server response      |
| --------------- | --------------------------------- | -------------------- |
| `missing`       | 200 with `item: null`             | 404 `ItemNotFound`   |
| `http-error`    | 503 with a plain-text body        | 502 `TransportError` |
| `graphql-error` | 200 with a GraphQL `errors` array | 502 `ResponseError`  |
| `invalid-data`  | 200 with a numeric `name`         | 502 `DecodeError`    |

The fixture requires a query string and chooses a response from the operation name and variables. It leaves execution and validation of the query to a real upstream. Effect classifies failures using the response body as well as the status. A non-2xx GraphQL error envelope can also produce a `ResponseError`.

## Follow the request

1. At startup, `src/index.ts` adds `UpstreamItemsLive` to `AllRouters`. The route layer supplies `GraphQLProtocol.layerHttp` with `FetchHttpClient.layer` and builds the lookup client once.
2. On each GET, `src/api/UpstreamItems.ts` reads the path ID and calls the lookup. `src/graphql/Items.ts` sends a GraphQL POST with the `FindItem` operation and the typed `id` variable. The client decodes the returned data using the operation's result schema.
3. The lookup turns a null item into the domain's missing-item error. The route maps that error and the client's typed failures to the HTTP responses above.

## Adapt the lookup

Set `UPSTREAM_GRAPHQL_URL` to point to another endpoint. The example reuses the domain schema in the GraphQL result because both currently use `id` and `name`.

To practice adapting the query, imagine the upstream renames `name` to `displayName`. Change the selection and give the query its own result schema with `displayName`. Map that field to the domain's `name` in the lookup so the REST response stays the same. Update both fixture payloads that return an item, then retry `demo` and `invalid-data`.

For a second query, add its operation to `GraphQLGroup.make` and call its typed client method. To exercise the lookup in isolation, supply a fixture `GraphQLProtocol` layer to `makeItemLookup`.

This example uses the experimental [Effect GraphQL client](https://effect.website/docs/v4/api/effect/graphql/GraphQLClient) at Effect 4.1.4.
