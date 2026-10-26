import { Schema } from "effect";

export const McpPromptSelection = Schema.Struct({
  name: Schema.NonEmptyString,
  arguments: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
export type McpPromptSelection = Schema.Schema.Type<typeof McpPromptSelection>;

export const McpPromptArgument = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  required: Schema.optional(Schema.Boolean),
});
export type McpPromptArgument = Schema.Schema.Type<typeof McpPromptArgument>;

export const McpPromptDescriptor = Schema.Struct({
  name: Schema.String,
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  arguments: Schema.optional(Schema.Array(McpPromptArgument)),
});
export type McpPromptDescriptor = Schema.Schema.Type<
  typeof McpPromptDescriptor
>;

export const McpPromptMessage = Schema.Struct({
  role: Schema.Literals(["user", "assistant"]),
  content: Schema.String,
});
export type McpPromptMessage = Schema.Schema.Type<typeof McpPromptMessage>;

export class McpPromptSelectionError extends Schema.TaggedError<McpPromptSelectionError>()(
  "McpPromptSelectionError",
  { message: Schema.String },
) {}

export class McpPromptOptionError extends Schema.TaggedError<McpPromptOptionError>()(
  "McpPromptOptionError",
  { message: Schema.String },
) {}

export class McpPromptError extends Schema.TaggedError<McpPromptError>()(
  "McpPromptError",
  { message: Schema.String },
) {}
