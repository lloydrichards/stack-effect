import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";
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
    assert.throws(() =>
      Schema.decodeSync(TargetIdentity)({ kind: "package", name }),
    );
  });
  it("should reject an identity when the package name is empty or the kind is unsafe", () => {
    assert.throws(() =>
      Schema.decodeSync(TargetIdentity)({ kind: "package", name: "" }),
    );
    assert.throws(() =>
      Schema.decodeSync(TargetIdentity)({ kind: "server/sdk", name: "api" }),
    );
  });
  it("should detect overlap when directory boundaries differ only by case", () => {
    assert.strictEqual(
      targetPathsOverlap("packages/SDK", "packages/sdk/client"),
      true,
    );
    assert.strictEqual(
      targetPathsOverlap("packages/sdk", "packages/sdk-other"),
      false,
    );
  });
});
