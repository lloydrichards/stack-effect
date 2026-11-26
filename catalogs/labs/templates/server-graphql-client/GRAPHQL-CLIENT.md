# Look up an item through GraphQL

Selecting GraphQL Client also adds GraphQL Query Server to the API target. Start the generated server from this directory.

```bash
{{runCommand}} dev
```

```bash
curl -i http://127.0.0.1:9000/upstream-items/demo
curl -i http://127.0.0.1:9000/upstream-items/missing
```

The first request returns `{"id":"demo","name":"Demo item"}`. The second returns HTTP 404 with `{"error":"ItemNotFound"}`.

## Follow the request

1. `src/api/UpstreamItems.ts` reads the path ID and calls the typed lookup in `src/graphql/Items.ts`.
2. The lookup POSTs `FindItem` to `/graphql` on the same server. The GraphQL resolver calls the injected `CatalogItems` service. See [GRAPHQL.md](GRAPHQL.md) for the query and server layer.
3. The lookup decodes the returned data. It maps an upstream `ITEM_NOT_FOUND` error or a null item to the domain's missing-item error. The route returns HTTP 502 for other GraphQL client errors.

## Use a different upstream

By default the client uses `http://127.0.0.1:<PORT>/graphql`. The port defaults to 9000. Set `UPSTREAM_GRAPHQL_URL` for a different endpoint or if the server binds to an address other than loopback.

If the upstream uses `displayName` instead of `name`, change the query selection and give the operation a result schema with `displayName`. Map it to the domain's `name` in the lookup to keep the REST response stable.

This example uses the experimental Effect GraphQL client. When adding it to an older project, upgrade Effect and its platform packages to the catalog pin first.
