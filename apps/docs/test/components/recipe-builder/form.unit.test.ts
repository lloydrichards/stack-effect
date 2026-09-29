import { CustomCatalogSource } from "@repo/domain/CatalogSource";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { toRecipePreviewInput } from "../../../app/components/recipe-builder/form";
import { fullStackRecipeFixture } from "./recipe-fixtures";

describe("recipe preview input", () => {
  const ext = Schema.decodeSync(CustomCatalogSource)({
    name: "ext",
    url: "https://ext.example.test/v1.json",
  });

  it("keeps official tool, database, and Git choices with the official catalog", () => {
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

    expect(input.config.lint).toBe(fullStackRecipeFixture.config.lint);
    expect(targets).toContain("workspace");
    expect(targets).toContain("package");
  });

  it("drops official tool, database, and Git choices without the official catalog", () => {
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
