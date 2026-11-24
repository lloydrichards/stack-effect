import { Schema } from "effect";

export const UpstreamItemId = Schema.NonEmptyString.pipe(
  Schema.brand("UpstreamItemId"),
);
export type UpstreamItemId = typeof UpstreamItemId.Type;

export const UpstreamItem = Schema.Struct({
  id: UpstreamItemId,
  name: Schema.String,
});

export class UpstreamItemNotFound extends Schema.TaggedError<
  UpstreamItemNotFound,
  { readonly brand: unique symbol }
>()("UpstreamItemNotFound", { id: UpstreamItemId }) {}
