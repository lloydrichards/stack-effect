import { Schema } from "effect";

export class UnsupportedMcpContentError extends Schema.TaggedError<UnsupportedMcpContentError, { readonly brand: unique symbol }>()(
  "UnsupportedMcpContentError",
  {
    capability: Schema.Literals(["resource", "prompt"]),
    source: Schema.String,
    contentType: Schema.String,
    message: Schema.String,
  },
) {}
