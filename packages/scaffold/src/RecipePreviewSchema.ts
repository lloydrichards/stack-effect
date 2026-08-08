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

export const RecipePreviewInputSchema = Schema.Struct({
  recipe: RecipeSpec,
  config: StackConfig,
});

export type RecipePreviewInput = typeof RecipePreviewInputSchema.Type;

export const RecipePreviewSchema = Schema.Struct({
  command: Schema.String,
  selection: Selection,
  blueprint: Blueprint,
  files: Schema.Array(ApplyPreviewFileSchema),
});

export type RecipePreview = typeof RecipePreviewSchema.Type;
