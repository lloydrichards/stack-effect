import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { TargetIdentity, targetPathsOverlap } from "./Catalog";

describe("target identity placement", () => {
  it.each([
    "/api",
    "sdk/",
    "sdk//api",
    "sdk/..",
    "sdk/.hidden",
    "sdk/node_modules",
    "sdk/CON",
    "sdk/???",
    "sdk\\api",
    "sdk/api:bad",
  ])("should reject an identity when its name is unsafe: %s", (name) => {
    expect(() =>
      Schema.decodeSync(TargetIdentity)({ kind: "package", name }),
    ).toThrow();
  });
  it("should reject an identity when the package name is empty or the kind is unsafe", () => {
    expect(() =>
      Schema.decodeSync(TargetIdentity)({ kind: "package", name: "" }),
    ).toThrow();
    expect(() =>
      Schema.decodeSync(TargetIdentity)({ kind: "server/sdk", name: "api" }),
    ).toThrow();
  });
  it("should detect overlap when directory boundaries differ only by case", () => {
    expect(targetPathsOverlap("packages/SDK", "packages/sdk/client")).toBe(
      true,
    );
    expect(targetPathsOverlap("packages/sdk", "packages/sdk-other")).toBe(
      false,
    );
  });
});
