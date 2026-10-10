import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { RecipeTargetString } from "./RecipeTargets";

describe("recipe target syntax", () => {
  it.each(["server/sdk/api:server-http-api", "package/sdk/client"])(
    "should retain nested names when parsing %s",
    (value) => {
      const spec = Schema.decodeSync(RecipeTargetString)(value);
      expect(spec.target.kind).toBe(
        value.startsWith("server") ? "server" : "package",
      );
      expect(spec.target.name).toBe(
        value.startsWith("server") ? "sdk/api" : "sdk/client",
      );
      expect(Schema.encodeSync(RecipeTargetString)(spec)).toBe(value);
    },
  );
  it.each([
    "server/sdk//api",
    "package/",
    "server/sdk/../api",
    "server/api:",
    "server/api: , ",
  ])("should reject target syntax when parsing malformed %s", (value) => {
    expect(() => Schema.decodeSync(RecipeTargetString)(value)).toThrow();
  });
});
