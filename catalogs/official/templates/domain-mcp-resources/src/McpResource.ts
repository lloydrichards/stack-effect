import { Schema } from "effect";

export const McpResourceUris = Schema.NonEmptyArray(Schema.NonEmptyString);
export type McpResourceUris = typeof McpResourceUris.Type;
