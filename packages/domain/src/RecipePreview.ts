/**
 * The request and result of a Recipe Builder preview: the recipe and
 * configuration a visitor chose, and the files the scaffold would write for
 * them in an empty repository.
 */
import { Schema } from "effect";
import { Blueprint } from "./Blueprint";
import { RecipeSpec } from "./Recipe";
import { StackConfig } from "./Scaffold";
import { Selection } from "./Selection";

/**
 * One file a preview would create or modify, with its full contents.
 *
 * **When to use**
 *
 * Read it to show or diff the files a dry run or preview produces.
 */
export const ApplyPreviewFile = Schema.Struct({
  path: Schema.String,
  status: Schema.Literals(["created", "modified"]),
  contents: Schema.String,
});

export type ApplyPreviewFile = typeof ApplyPreviewFile.Type;

/**
 * The recipe and configuration a preview runs for.
 *
 * **When to use**
 *
 * Decode it at the boundary where a preview request arrives, such as the
 * Recipe Builder worker or its URL state.
 */
export const RecipePreviewInput = Schema.Struct({
  recipe: RecipeSpec,
  config: StackConfig,
});

export type RecipePreviewInput = typeof RecipePreviewInput.Type;

/**
 * What a preview resolved and the files it would write, sorted by path.
 *
 * **When to use**
 *
 * Present a preview result, or encode it across a worker boundary.
 *
 * **Gotchas**
 *
 * `files` lists only created and modified paths, plus the generated
 * `stack.effect.json`. It is not a complete repository snapshot.
 */
export const RecipePreview = Schema.Struct({
  command: Schema.String,
  selection: Selection,
  blueprint: Blueprint,
  files: Schema.Array(ApplyPreviewFile),
});

export type RecipePreview = typeof RecipePreview.Type;
