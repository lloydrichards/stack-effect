import { assert, describe, it } from "@effect/vitest";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import {
  parseRecipeTargetSpecs,
  RecipeTargetString,
} from "@repo/scaffold/RecipeTargets";
import { Effect, Schema } from "effect";

describe("recipe target syntax", () => {
  it.each(["server/sdk/api:server-http-api", "package/sdk/client"])(
    "should retain nested names when parsing %s",
    (value) => {
      const spec = Schema.decodeSync(RecipeTargetString)(value);
      assert.strictEqual(
        spec.target.kind,
        value.startsWith("server") ? "server" : "package",
      );
      assert.strictEqual(
        spec.target.name,
        value.startsWith("server") ? "sdk/api" : "sdk/client",
      );
      assert.strictEqual(Schema.encodeSync(RecipeTargetString)(spec), value);
    },
  );
  it.each([
    "server/sdk//api",
    "package/",
    "server/sdk/../api",
    "server/api:",
    "server/api: , ",
  ])("should reject target syntax when parsing malformed %s", (value) => {
    assert.throws(() => Schema.decodeSync(RecipeTargetString)(value));
  });
});

describe("parseRecipeTargetSpecs", () => {
  it("should keep the last identity when target specs share a key", () => {
    const decode = Schema.decodeSync(RecipeTargetString);
    const targets = Effect.runSync(
      parseRecipeTargetSpecs([
        decode("server/Api:server-http-api"),
        decode("server/api:server-http-rpc"),
      ]),
    );

    assert.deepStrictEqual(targets, [
      {
        target: new TargetIdentity({
          kind: TargetKind.make("server"),
          name: "api",
        }),
        modules: [
          ModuleId.make("server-http-api"),
          ModuleId.make("server-http-rpc"),
        ],
      },
    ]);
  });
});
