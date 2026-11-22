import {
  type CatalogItem,
  type CatalogItemId,
  CatalogItemNotFound,
} from "@repo/domain/CatalogItem";
import { Context, Effect, Layer } from "effect";

export class CatalogItems extends Context.Service<
  CatalogItems,
  {
    readonly lookup: (
      id: CatalogItemId,
    ) => Effect.Effect<CatalogItem, CatalogItemNotFound>;
  }
>()("example/CatalogItems") {}

export const CatalogItemsMemory = Layer.succeed(CatalogItems, {
  lookup: Effect.fn("CatalogItems.lookup")(function* (id: CatalogItemId) {
    if (id !== "demo") {
      return yield* Effect.fail(CatalogItemNotFound.make({ id }));
    }

    return { id, name: "Demo item" };
  }),
});
