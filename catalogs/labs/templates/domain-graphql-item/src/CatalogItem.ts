import { Data, Schema } from "effect";

export const CatalogItem = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.String,
});
export type CatalogItem = typeof CatalogItem.Type;

export class CatalogItemNotFound extends Data.TaggedError(
  "CatalogItemNotFound",
)<{
  readonly id: string;
}> {}
