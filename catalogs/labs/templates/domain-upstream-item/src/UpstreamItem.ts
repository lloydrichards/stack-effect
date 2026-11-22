import { Schema } from "effect";

export const UpstreamItemId = Schema.NonEmptyString;
export type UpstreamItemId = typeof UpstreamItemId.Type;

export const UpstreamItem = Schema.Struct({
  id: UpstreamItemId,
  name: Schema.String,
});

export const UpstreamItemNotFound = Schema.TaggedStruct(
  "UpstreamItemNotFound",
  {
    id: UpstreamItemId,
  },
);
