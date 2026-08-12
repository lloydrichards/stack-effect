import { Option, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  initialRecipeBuilderValues,
  RecipeBuilderFormSchema,
} from "../../../app/components/recipe-builder/form";

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
