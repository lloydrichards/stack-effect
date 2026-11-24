import { Schema } from "effect";

export const CatalogItemId = Schema.NonEmptyString.pipe(
  Schema.brand("CatalogItemId"),
);
export type CatalogItemId = typeof CatalogItemId.Type;

export const CatalogItem = Schema.Struct({
  id: CatalogItemId,
  name: Schema.String,
});
export type CatalogItem = typeof CatalogItem.Type;

export class CatalogItemNotFound extends Schema.TaggedError<
  CatalogItemNotFound,
  { readonly brand: unique symbol }
>()("CatalogItemNotFound", { id: CatalogItemId }) {}
