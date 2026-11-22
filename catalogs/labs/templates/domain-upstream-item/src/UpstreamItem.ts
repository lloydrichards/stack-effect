import { Data, Schema } from "effect";

export const UpstreamItem = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.String,
});

export class UpstreamItemNotFound extends Data.TaggedError(
  "UpstreamItemNotFound",
)<{
  readonly id: string;
}> {}
