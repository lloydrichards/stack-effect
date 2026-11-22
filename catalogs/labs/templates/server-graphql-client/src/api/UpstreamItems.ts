// Generated from stack-effect catalog. Edit this workspace, then use git diff to port changes back.
// Catalog contributors: apps/server-api#server-graphql-client:file

// @effect-diagnostics unstableApiUsage:off The route uses Effect HTTP response constructors.
// @effect-diagnostics experimentalApiUsage:off This Labs example demonstrates Effect's experimental GraphQL client.
import { UpstreamItemId } from "@repo/domain/UpstreamItem";
import { Config, Effect, Layer, Option, Schema } from "effect";
import { GraphQLProtocol } from "effect/graphql";
import { FetchHttpClient, HttpRouter, HttpServerResponse } from "effect/http";
import { makeItemLookup } from "../graphql/Items";

const UpstreamGraphQLConfig = Config.all({
  url: Config.option(Config.String("UPSTREAM_GRAPHQL_URL")),
  port: Config.Number("PORT").pipe(Config.withDefault(9000)),
});

const ItemParams = Schema.Struct({ id: UpstreamItemId });

const UpstreamGraphQLLive = Layer.unwrap(
  Effect.gen(function* () {
    const { url, port } = yield* UpstreamGraphQLConfig;

    return GraphQLProtocol.layerHttp({
      url: Option.getOrElse(url, () => `http://127.0.0.1:${port}/graphql`),
    });
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
