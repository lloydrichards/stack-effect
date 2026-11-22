// @effect-diagnostics unstableApiUsage:off This adapter uses Effect's HTTP JSON response constructor.
import { Effect, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { graphql } from "graphql";
import { makeSchema } from "../graphql/schema";
import { CatalogItems } from "../services/CatalogItems";

const GraphQLRequest = Schema.Struct({
  query: Schema.NonEmptyString,
  variables: Schema.optionalKey(
    Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  ),
  operationName: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

export const GraphQLRoutes = HttpRouter.use((router) =>
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
                  variableValues: variables ?? undefined,
                  operationName: operationName ?? undefined,
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
