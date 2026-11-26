import { UpstreamItemId } from "@repo/domain/UpstreamItem";
import { Config, Effect, Layer, Option, Schema } from "effect";
import { GraphQLProtocol } from "effect/graphql";
import { FetchHttpClient, HttpRouter, HttpServerResponse } from "effect/http";
import { makeItemLookup } from "../graphql/Items";
import { ServerConfig } from "../ServerConfig";

const GraphQLConfig = Config.all({
  url: Config.option(Config.String("UPSTREAM_GRAPHQL_URL")),
});

const ItemParams = Schema.Struct({ id: UpstreamItemId });

const UpstreamGraphQLLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { url } = yield* GraphQLConfig;
    const { port } = yield* ServerConfig;

    return GraphQLProtocol.layerHttp({
      url: Option.getOrElse(url, () => `http://127.0.0.1:${port}/graphql`),
    });
  }),
).pipe(Layer.provide(FetchHttpClient.layer));

export const UpstreamItemsRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const lookup = yield* makeItemLookup;

    yield* router.add(
      "GET",
      "/upstream-items/:id",
      Effect.gen(function* () {
        const params = yield* HttpRouter.schemaPathParams(ItemParams).pipe(
          Effect.option,
        );
        if (Option.isNone(params)) {
          return yield* HttpServerResponse.json(
            { error: "InvalidItemId" },
            { status: 400 },
          );
        }

        const item = yield* lookup(params.value.id);

        return yield* HttpServerResponse.json(item);
      }).pipe(
        Effect.catchTags({
          UpstreamItemNotFound: () =>
            HttpServerResponse.json({ error: "ItemNotFound" }, { status: 404 }),
          GraphQLClientError: ({ reason }) =>
            HttpServerResponse.json({ error: reason._tag }, { status: 502 }),
        }),
      ),
    );
  }),
).pipe(Layer.provide(UpstreamGraphQLLayer));
