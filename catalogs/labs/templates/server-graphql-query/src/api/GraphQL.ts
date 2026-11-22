// @effect-diagnostics unstableApiUsage:off This adapter uses Effect's HTTP JSON response constructor.
import { Effect, Layer, Schema } from "effect";
import {
  type HttpBody,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/http";
import { graphql } from "graphql";
import { makeSchema } from "../graphql/schema";
import { CatalogItems } from "../services/CatalogItems";

const GraphQLRequest = Schema.Struct({
  query: Schema.NonEmptyString,
  variables: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  operationName: Schema.optionalKey(Schema.String),
});

export const GraphQLRouteLive: Layer.Layer<
  never,
  never,
  | CatalogItems
  | HttpRouter.HttpRouter
  | HttpRouter.Request<"Error", HttpBody.HttpBodyError>
> = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const schema = makeSchema(yield* CatalogItems);
    yield* router.add(
      "POST",
      "/graphql",
      HttpServerRequest.schemaBodyJson(GraphQLRequest).pipe(
        Effect.matchEffect({
          onFailure: () =>
            HttpServerResponse.json(
              {
                errors: [{ message: "Expected a JSON GraphQL request" }],
              },
              { status: 400 },
            ),
          onSuccess: ({ query, variables, operationName }) =>
            Effect.gen(function* () {
              const result = yield* Effect.promise((signal) =>
                graphql({
                  schema,
                  source: query,
                  variableValues: variables,
                  operationName,
                  contextValue: signal,
                }),
              );
              return yield* HttpServerResponse.json(result, {
                status: result.data === undefined ? 400 : 200,
              });
            }),
        }),
      ),
    );
  }),
);
