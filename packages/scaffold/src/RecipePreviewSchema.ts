import { Blueprint } from "@repo/domain/Blueprint";
import { RecipeSpec } from "@repo/domain/Recipe";
import { StackConfig } from "@repo/domain/Scaffold";
import { Selection } from "@repo/domain/Selection";
import { Schema } from "effect";

export const ApplyPreviewFileSchema = Schema.Struct({
  path: Schema.String,
  status: Schema.Literals(["created", "modified"]),
  contents: Schema.String,
});

export type ApplyPreviewFile = typeof ApplyPreviewFileSchema.Type;

export const RecipePreviewInput = Schema.Struct({
  recipe: RecipeSpec,
  config: StackConfig,
});

export type RecipePreviewInput = typeof RecipePreviewInput.Type;

export const RecipePreview = Schema.Struct({
  command: Schema.String,
  selection: Schema.toEncoded(Selection),
  blueprint: Schema.toEncoded(Blueprint),
  files: Schema.Array(ApplyPreviewFileSchema),
});

export type RecipePreview = typeof RecipePreview.Type;
