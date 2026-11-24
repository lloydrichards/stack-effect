import { assert, describe, it } from "@effect/vitest";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import {
  parseRecipeTargetSpecs,
  RecipeTargetString,
} from "@repo/domain/Recipe";
import { Effect, Schema } from "effect";

describe("RecipeTargetString", () => {
  it("should decode the target and modules when the spec is compact", () => {
    const decoded = Schema.decodeSync(RecipeTargetString)(
      "client-react/web:client-react-chat,client-react-http-api",
    );

    assert.deepStrictEqual(decoded, {
      target: new TargetIdentity({
        kind: TargetKind.make("client-react"),
        name: "web",
      }),
      modules: [
        ModuleId.make("client-react-chat"),
        ModuleId.make("client-react-http-api"),
      ],
    });
  });

  it("should encode the compact string when a spec has a target and modules", () => {
    const encoded = Schema.encodeUnknownSync(RecipeTargetString)({
      target: new TargetIdentity({
        kind: TargetKind.make("package"),
        name: "ai",
      }),
      modules: [
        ModuleId.make("package-ai-chat-service"),
        ModuleId.make("package-ai-chat-toolkit-math"),
      ],
    });

    assert.strictEqual(
      encoded,
      "package/ai:package-ai-chat-service,package-ai-chat-toolkit-math",
    );
  });

  it("should trim each part when the spec has surrounding whitespace", () => {
    const decoded = Schema.decodeSync(RecipeTargetString)(
      " server / api : server-http-api , server-chat-rpc ",
    );

    assert.deepStrictEqual(decoded, {
      target: new TargetIdentity({
        kind: TargetKind.make("server"),
        name: "api",
      }),
      modules: [
        ModuleId.make("server-http-api"),
        ModuleId.make("server-chat-rpc"),
      ],
    });
  });

  it("should keep an empty name for default-name resolution when the spec omits the name", () => {
    const decoded = Schema.decodeSync(RecipeTargetString)(
      "server/:server-chat-rpc",
    );
    const encoded = Schema.encodeUnknownSync(RecipeTargetString)(decoded);

    assert.deepStrictEqual(decoded, {
      target: new TargetIdentity({ kind: TargetKind.make("server"), name: "" }),
      modules: [ModuleId.make("server-chat-rpc")],
    });
    assert.strictEqual(encoded, "server/:server-chat-rpc");
  });

  it("should round-trip with no modules when the spec has no module list", () => {
    const decoded = Schema.decodeSync(RecipeTargetString)("server-mcp/");
    const encoded = Schema.encodeUnknownSync(RecipeTargetString)(decoded);

    assert.deepStrictEqual(decoded, {
      target: new TargetIdentity({
        kind: TargetKind.make("server-mcp"),
        name: "",
      }),
      modules: [],
    });
    assert.strictEqual(encoded, "server-mcp/");
  });

  it.each([
    {
      label: "nested names",
      value: "server/sdk/api:server-http-api",
      kind: "server",
      name: "sdk/api",
    },
    {
      label: "a nested package without modules",
      value: "package/sdk/client",
      kind: "package",
      name: "sdk/client",
    },
  ])(
    "should keep the nested name and round-trip when the spec has $label",
    ({ value, kind, name }) => {
      const spec = Schema.decodeSync(RecipeTargetString)(value);

      assert.strictEqual(spec.target.kind, kind);
      assert.strictEqual(spec.target.name, name);
      assert.strictEqual(Schema.encodeSync(RecipeTargetString)(spec), value);
    },
  );

  it.each([
    ":server-http-api",
    " /api:server-http-api",
    "server:server-http-api",
    "server/api:",
    "server/api:,",
    "server/api: , ",
    "server/sdk//api",
    "server/sdk/../api",
    "package/",
  ])("should reject the spec when it is malformed: '%s'", (value) => {
    assert.throws(() => Schema.decodeSync(RecipeTargetString)(value));
  });
});

describe("parseRecipeTargetSpecs", () => {
  it("should merge modules under the last identity when target specs share a key", () => {
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
