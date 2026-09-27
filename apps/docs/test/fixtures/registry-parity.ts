import type { RecipePreviewInput } from "@repo/scaffold/recipe-preview";
import { toRecipePreviewInput } from "../../app/components/recipe-builder/form";
import { fullStackRecipeFixture } from "../components/recipe-builder/recipe-fixtures";

const fullStack = { ...fullStackRecipeFixture, gitEnabled: false };

export const registryParityCases = {
  bun: toRecipePreviewInput(fullStack),
  node: toRecipePreviewInput({
    ...fullStack,
    config: {
      ...fullStack.config,
      runtime: { _tag: "node", packageManager: "npm" },
    },
  }),
  deno: toRecipePreviewInput({
    ...fullStack,
    config: {
      name: "deno-preview",
      runtime: { _tag: "deno" },
      typescript: "6",
      monorepo: undefined,
      lint: undefined,
      format: undefined,
      test: "vitest",
    },
    database: "sqlite",
    targets: [],
    supportSelections: [],
  }),
} satisfies Record<string, RecipePreviewInput>;

export type RegistryParityCase = keyof typeof registryParityCases;
