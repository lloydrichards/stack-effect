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

export const CatalogItemNotFound = Schema.TaggedStruct("CatalogItemNotFound", {
  id: CatalogItemId,
});
export type CatalogItemNotFound = typeof CatalogItemNotFound.Type;
