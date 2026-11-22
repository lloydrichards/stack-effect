import { Schema } from "effect";

export const UpstreamItem = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.String,
});

export const UpstreamItemNotFound = Schema.TaggedStruct("UpstreamItemNotFound", {
  id: Schema.String,
});
