import { CustomCatalogSource } from "@repo/domain/CatalogSource";
import { Option, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  initialRecipeBuilderValues,
  RecipeBuilderFormSchema,
  toRecipePreviewInput,
} from "../../../app/components/recipe-builder/form";
import { fullStackRecipeFixture } from "./recipe-fixtures";

const decodeForm = Schema.decodeUnknownOption(RecipeBuilderFormSchema);

describe("recipe builder form", () => {
  it("should reject a target name when it is outside the canonical path format", () => {
    const result = decodeForm({
      ...initialRecipeBuilderValues,
      targets: [
        {
          id: "client-1",
          kind: "client-react",
          name: "Invalid Name",
          modules: [],
        },
      ],
    });

    expect(Option.isNone(result)).toBe(true);
  });

  it("should reject target identities when their kind and name are duplicated", () => {
    const target = {
      id: "client-1",
      kind: "client-react",
      name: "web",
      modules: [],
    };
    const result = decodeForm({
      ...initialRecipeBuilderValues,
      targets: [target, { ...target, id: "client-2" }],
    });

    expect(Option.isNone(result)).toBe(true);
  });
});

describe("recipe preview input", () => {
  const ext = Schema.decodeSync(CustomCatalogSource)({
    name: "ext",
    url: "https://ext.example.test/v1.json",
  });

  it("should keep official tool, database, and Git choices when the official catalog is selected", () => {
    const input = toRecipePreviewInput({
      ...fullStackRecipeFixture,
      config: {
        ...fullStackRecipeFixture.config,
        catalogs: [{ name: "official" }, ext],
      },
      database: "sqlite",
      gitEnabled: true,
    });
    const targets = input.recipe.targets.map(({ target }) => target.kind);
    const modules = input.recipe.targets.flatMap(({ modules }) => modules);

    expect(input.config.lint).toBe(fullStackRecipeFixture.config.lint);
    expect(targets).toContain("workspace");
    expect(targets).toContain("package");
    expect(modules).toContain("workspace-devenv-git");
  });

  it("should drop official tool, database, and Git choices when the official catalog is not selected", () => {
    const input = toRecipePreviewInput({
      ...fullStackRecipeFixture,
      config: { ...fullStackRecipeFixture.config, catalogs: [ext] },
      database: "sqlite",
      gitEnabled: true,
      developerExperienceModules: ["workspace-devenv-husky"],
    });
    const modules = input.recipe.targets.flatMap(({ modules }) => modules);

    expect(input.config.monorepo).toBeUndefined();
    expect(input.config.lint).toBeUndefined();
    expect(input.config.format).toBeUndefined();
    expect(input.config.test).toBeUndefined();
    expect(modules).not.toContain("workspace-devenv-git");
    expect(modules).not.toContain("workspace-devenv-husky");
    expect(modules).not.toContain("package-db-sqlite");
  });
});
