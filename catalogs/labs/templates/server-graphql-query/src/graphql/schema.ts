import { Effect } from "effect";
import {
  GraphQLError,
  GraphQLID,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from "graphql";
import type { CatalogItems } from "../services/CatalogItems";

const Item = new GraphQLObjectType({
  name: "Item",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    name: { type: new GraphQLNonNull(GraphQLString) },
  },
});

export const makeSchema = ({ lookup }: typeof CatalogItems.Service) =>
  new GraphQLSchema({
    query: new GraphQLObjectType<unknown, AbortSignal>({
      name: "Query",
      fields: {
        item: {
          type: Item,
          args: { id: { type: new GraphQLNonNull(GraphQLID) } },
          resolve: (_source, { id }: { id: string }, signal) =>
            Effect.runPromise(
              lookup(id).pipe(
                Effect.match({
                  // GraphQL treats an Error returned by a resolver as a field error.
                  onFailure: () =>
                    new GraphQLError("Item not found", {
                      extensions: { code: "ITEM_NOT_FOUND" },
                    }),
                  onSuccess: (item) => item,
                }),
              ),
              { signal },
            ),
        },
      },
    }),
  });
