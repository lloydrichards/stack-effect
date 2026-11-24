// Generated from stack-effect catalog. Edit this workspace, then use git diff to port changes back.
// Catalog contributors: apps/server-api#server-graphql-client:file

// @effect-diagnostics experimentalApiUsage:off This Labs example demonstrates Effect's experimental GraphQL client.
import {
  UpstreamItem,
  UpstreamItemId,
  UpstreamItemNotFound,
} from "@repo/domain/UpstreamItem";
import { Effect, Schema } from "effect";
import { GraphQL, GraphQLClient, GraphQLGroup } from "effect/graphql";

const FindItem = GraphQL.query("FindItem", {
  document: `query FindItem($id: ID!) {
    item(id: $id) { id name }
  }`,
  variables: { id: UpstreamItemId },
  result: Schema.Struct({ item: Schema.NullOr(UpstreamItem) }),
});

export const makeItemLookup = Effect.gen(function* () {
  const client = yield* GraphQLClient.make(GraphQLGroup.make(FindItem));

  return Effect.fn("GraphQLItems.lookup")(function* (id: UpstreamItemId) {
    const { item } = yield* client.FindItem({ id }).pipe(
      Effect.catchTag("GraphQLClientError", (error) =>
        Effect.gen(function* () {
          const { reason } = error;

          if (
            reason._tag === "ResponseError" &&
            reason.errors.length === 1 &&
            reason.errors[0].extensions?.["code"] === "ITEM_NOT_FOUND"
          ) {
            return yield* new UpstreamItemNotFound({ id });
          }

          return yield* error;
        }),
      ),
    );

    if (item === null) {
      return yield* new UpstreamItemNotFound({ id });
    }

    return item;
  });
});
