import { Schema } from "effect";

export class UnsupportedMcpContentError extends Schema.TaggedError<UnsupportedMcpContentError>()(
  "UnsupportedMcpContentError",
  {
    capability: Schema.Literals(["resource", "prompt"]),
    source: Schema.String,
    contentType: Schema.String,
    message: Schema.String,
  },
) {}
