import { assert, describe, it } from "@effect/vitest";
import { ModuleId, TargetKind } from "@repo/domain/Catalog";
import { CustomCatalogSource } from "@repo/domain/CatalogSource";
import { Option, Schema } from "effect";
import {
  initialRecipeBuilderValues,
  RecipeBuilderFormValues,
  toRecipePreviewInput,
} from "../../../app/components/recipe-builder/form";
import { fullStackRecipeFixture } from "./recipe-fixtures";

const decodeForm = Schema.decodeUnknownOption(RecipeBuilderFormValues);

describe("recipe builder form", () => {
  it.each(["Invalid Name", "sdk//web", "../web", "sdk/con"])(
    "should reject %s when it is outside the safe canonical path format",
    (name) => {
      const result = decodeForm({
        ...initialRecipeBuilderValues,
        targets: [
          {
            id: "client-1",
            kind: "client-react",
            name,
            modules: [],
          },
        ],
      });

      assert.strictEqual(Option.isNone(result), true);
    },
  );

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

    assert.strictEqual(Option.isNone(result), true);
  });
});

describe("recipe preview input", () => {
  it("should represent None tooling choices as absent configuration instead of empty module IDs", () => {
    const input = toRecipePreviewInput({
      ...initialRecipeBuilderValues,
      config: {
        ...initialRecipeBuilderValues.config,
        monorepo: "",
        lint: "",
        format: "",
        test: "",
      },
    });
    assert.isUndefined(input.config.monorepo);
    assert.isUndefined(input.config.lint);
    assert.isUndefined(input.config.format);
    assert.isUndefined(input.config.test);
  });

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

    assert.strictEqual(input.config.lint, fullStackRecipeFixture.config.lint);
    assert.include(targets, TargetKind.make("workspace"));
    assert.include(targets, TargetKind.make("package"));
    assert.include(modules, ModuleId.make("workspace-devenv-git"));
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

    assert.isUndefined(input.config.monorepo);
    assert.isUndefined(input.config.lint);
    assert.isUndefined(input.config.format);
    assert.isUndefined(input.config.test);
    assert.notInclude(modules, ModuleId.make("workspace-devenv-git"));
    assert.notInclude(modules, ModuleId.make("workspace-devenv-husky"));
    assert.notInclude(modules, ModuleId.make("package-db-sqlite"));
  });
});
