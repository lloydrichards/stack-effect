import { Option, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  initialRecipeBuilderValues,
  RecipeBuilderFormSchema,
  toRecipePreviewInput,
} from "../../../app/components/recipe-builder/form";

const decodeForm = Schema.decodeUnknownOption(RecipeBuilderFormSchema);

describe("recipe builder form", () => {
  it("defaults infrastructure to none and carries Cloudflare intent only when selected", () => {
    expect(initialRecipeBuilderValues.config.infrastructure).toBe("none");
    expect(
      toRecipePreviewInput(initialRecipeBuilderValues).config.infrastructure,
    ).toBeUndefined();
    expect(
      toRecipePreviewInput({
        ...initialRecipeBuilderValues,
        config: {
          ...initialRecipeBuilderValues.config,
          infrastructure: "cloudflare",
        },
      }).config.infrastructure,
    ).toBe("cloudflare");
  });

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
