import { CatalogItemId } from "@repo/domain/CatalogItem";
import { Cause, Effect, Schema } from "effect";
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

const isCatalogItemId = Schema.is(CatalogItemId);

const resolveItem = (
  lookup: typeof CatalogItems.Service.lookup,
  id: string,
  signal: AbortSignal,
) => {
  if (!isCatalogItemId(id)) {
    throw new GraphQLError("Expected a non-empty item ID", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const result = Effect.suspend(() => lookup(id)).pipe(
    Effect.catchTag("CatalogItemNotFound", () =>
      Effect.succeed(
        // GraphQL treats an Error returned by a resolver as a field error.
        new GraphQLError("Item not found", {
          extensions: { code: "ITEM_NOT_FOUND" },
        }),
      ),
    ),
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterruptsOnly(cause),
      (cause) =>
        Effect.logError(cause).pipe(
          Effect.as(
            new GraphQLError("Item lookup failed", {
              extensions: { code: "INTERNAL_SERVER_ERROR" },
            }),
          ),
        ),
    ),
  );

  return Effect.runPromise(result, { signal });
};

export const makeSchema = ({ lookup }: typeof CatalogItems.Service) =>
  new GraphQLSchema({
    query: new GraphQLObjectType<unknown, AbortSignal>({
      name: "Query",
      fields: {
        item: {
          type: Item,
          args: { id: { type: new GraphQLNonNull(GraphQLID) } },
          resolve: (_source, { id }: { id: string }, signal) =>
            resolveItem(lookup, id, signal),
        },
      },
    }),
  });
