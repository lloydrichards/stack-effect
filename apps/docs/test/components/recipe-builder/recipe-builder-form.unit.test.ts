import { Option, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  initialRecipeBuilderValues,
  RecipeBuilderFormSchema,
  toRecipePreviewInput,
} from "../../../app/components/recipe-builder/form";
import {
  getGitHookProviderValue,
  normalizeGitHookModules,
  replaceGitHookProvider,
} from "../../../app/components/recipe-builder/git-hook-options";

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

  it("replaces providers while preserving unrelated ordered DX modules", () => {
    const modules = ["dx-first", "workspace-git-hooks-lefthook", "dx-second"];

    expect(replaceGitHookProvider(modules, "husky")).toEqual([
      "dx-first",
      "dx-second",
      "workspace-git-hooks-husky",
    ]);
    expect(replaceGitHookProvider(modules, "none")).toEqual([
      "dx-first",
      "dx-second",
    ]);
  });

  it("normalizes malformed, Git-disabled, and Bun-ineligible provider state", () => {
    const malformed = [
      "dx-first",
      "workspace-git-hooks-lefthook",
      "workspace-git-hooks-husky",
      "dx-second",
    ];

    expect(getGitHookProviderValue(malformed)).toBe("none");
    expect(
      normalizeGitHookModules(malformed, { gitEnabled: true, runtime: "node" }),
    ).toEqual(["dx-first", "dx-second"]);
    expect(
      normalizeGitHookModules(
        ["dx-first", "workspace-git-hooks-lefthook", "dx-second"],
        { gitEnabled: false, runtime: "node" },
      ),
    ).toEqual(["dx-first", "dx-second"]);
    expect(
      normalizeGitHookModules(
        ["dx-first", "workspace-git-hooks-husky", "dx-second"],
        { gitEnabled: true, runtime: "bun" },
      ),
    ).toEqual(["dx-first", "dx-second"]);
  });

  it("normalizes stale provider state before constructing preview input", () => {
    const input = toRecipePreviewInput({
      ...initialRecipeBuilderValues,
      config: {
        ...initialRecipeBuilderValues.config,
        runtime: { _tag: "bun" },
      },
      developerExperienceModules: [
        "dx-first",
        "workspace-git-hooks-husky",
        "dx-second",
      ],
    });
    const workspace = input.recipe.targets.find(
      ({ target }) => target.kind === "workspace",
    );

    expect(workspace?.modules.map(String)).toEqual([
      "workspace-devenv-git",
      "dx-first",
      "dx-second",
    ]);
    expect("gitHooks" in input.config).toBe(false);
  });
});
