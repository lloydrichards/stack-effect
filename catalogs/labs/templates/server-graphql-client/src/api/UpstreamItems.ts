// @effect-diagnostics unstableApiUsage:off The route uses Effect HTTP response constructors.
// @effect-diagnostics experimentalApiUsage:off This Labs example demonstrates Effect's experimental GraphQL client.
import { Config, Effect, Layer, Schema } from "effect";
import { GraphQLProtocol } from "effect/graphql";
import {
  FetchHttpClient,
  HttpRouter,
  HttpServerResponse,
} from "effect/http";
import { makeItemLookup } from "../graphql/Items";

const ItemParams = Schema.Struct({ id: Schema.NonEmptyString });

const UpstreamGraphQLLive = Layer.unwrap(
  Effect.gen(function* () {
    const url = yield* Config.String("UPSTREAM_GRAPHQL_URL").pipe(
      Config.withDefault("http://127.0.0.1:9010/graphql"),
    );
    return GraphQLProtocol.layerHttp({ url });
  }),
).pipe(Layer.provide(FetchHttpClient.layer));

export const UpstreamItemsLive = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const lookup = yield* makeItemLookup;

    yield* router.add(
      "GET",
      "/upstream-items/:id",
      Effect.gen(function* () {
        const { id } = yield* HttpRouter.schemaPathParams(ItemParams);
        const item = yield* lookup(id);
        return yield* HttpServerResponse.json(item);
      }).pipe(
        Effect.catchTags({
          SchemaError: () =>
            HttpServerResponse.json(
              { error: "InvalidItemId" },
              { status: 400 },
            ),
          UpstreamItemNotFound: () =>
            HttpServerResponse.json({ error: "ItemNotFound" }, { status: 404 }),
          GraphQLClientError: ({ reason }) =>
            HttpServerResponse.json({ error: reason._tag }, { status: 502 }),
        }),
      ),
    );
  }),
).pipe(Layer.provide(UpstreamGraphQLLive));
