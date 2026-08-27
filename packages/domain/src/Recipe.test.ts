import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { DddArchitecture } from "./Catalog";
import { RecipeSpec } from "./Recipe";

const classicPayload = {
  targets: [
    {
      target: { kind: "server", name: "todo" },
      modules: ["server-http-api-todos"],
    },
  ],
};

describe("@repo/domain Recipe architecture", () => {
  it("decodes old payloads and re-encodes them byte-equivalently", () => {
    const recipe = Schema.decodeUnknownSync(RecipeSpec)(classicPayload);
    expect(recipe.targets[0]?.architecture).toBeUndefined();
    expect(recipe.targets[0]).not.toHaveProperty("architecture");
    expect(Schema.encodeSync(RecipeSpec)(recipe)).toEqual(classicPayload);
  });

  it("normalizes explicit Classic to omitted no-noise representation", () => {
    const recipe = Schema.decodeUnknownSync(RecipeSpec)({
      targets: [{ ...classicPayload.targets[0], architecture: "classic" }],
    });
    expect(recipe.targets[0]?.architecture).toBeUndefined();
    expect(recipe.targets[0]).not.toHaveProperty("architecture");
    expect(Schema.encodeSync(RecipeSpec)(recipe)).toEqual(classicPayload);
  });

  it("retains explicit DDD intent", () => {
    const recipe = Schema.decodeUnknownSync(RecipeSpec)({
      targets: [{ ...classicPayload.targets[0], architecture: "ddd" }],
    });
    expect(recipe.targets[0]?.architecture).toBe(DddArchitecture);
    expect(Schema.encodeSync(RecipeSpec)(recipe).targets[0]).toHaveProperty(
      "architecture",
      "ddd",
    );
  });
});
