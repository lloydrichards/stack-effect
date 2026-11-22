import { Schema } from "effect";

export const CatalogItem = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.String,
});
export type CatalogItem = typeof CatalogItem.Type;

export const CatalogItemNotFound = Schema.TaggedStruct("CatalogItemNotFound", {
  id: Schema.String,
});
export type CatalogItemNotFound = typeof CatalogItemNotFound.Type;
