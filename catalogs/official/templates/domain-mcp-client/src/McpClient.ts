import { Schema } from "effect";

export class UnsupportedMcpContent extends Schema.TaggedError<UnsupportedMcpContent, { readonly brand: unique symbol }>()(
  "UnsupportedMcpContent",
  {
    capability: Schema.Literals(["resource", "prompt"]),
    source: Schema.String,
    contentType: Schema.String,
    message: Schema.String,
  },
) {}
