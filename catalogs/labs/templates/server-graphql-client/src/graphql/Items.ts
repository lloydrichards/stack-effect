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
    const { item } = yield* client.FindItem({ id });

    if (item === null) {
      return yield* Effect.fail(UpstreamItemNotFound.make({ id }));
    }

    return item;
  });
});
