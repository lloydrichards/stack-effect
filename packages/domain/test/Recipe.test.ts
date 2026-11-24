import { assert, describe, it } from "@effect/vitest";
import {
  ModuleCapability,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  parseRecipeTargetSpecs,
  RecipeResolveOptions,
  RecipeSpec,
  RecipeTargetString,
} from "@repo/domain/Recipe";
import { StackConfig } from "@repo/domain/StackConfig";
import { Effect, Schema } from "effect";

describe("RecipeTargetString", () => {
  it("decodes compact target specs", () => {
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

  it("encodes target specs back to compact strings", () => {
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

  it("normalizes whitespace while decoding", () => {
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

  it("preserves empty target names for default-name resolution", () => {
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

  it("round trips targets without modules", () => {
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

  it("rejects malformed target specs", () => {
    assert.throws(() =>
      Schema.decodeSync(RecipeTargetString)(":server-http-api"),
    );
    assert.throws(() => Schema.decodeSync(RecipeTargetString)("server/api:"));
    assert.throws(() =>
      Schema.decodeSync(RecipeTargetString)(" /api:server-http-api"),
    );
    assert.throws(() => Schema.decodeSync(RecipeTargetString)("server/api:,"));
    assert.throws(() =>
      Schema.decodeSync(RecipeTargetString)("server:server-http-api"),
    );
  });

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

describe("RecipeSpec and RecipeResolveOptions", () => {
  const testConfigFields = {
    name: "recipe-app",
    runtime: { _tag: "bun" },
    typescript: "7",
    monorepo: "vite-plus",
    lint: "oxlint",
    format: "oxfmt",
    test: "vitest",
  } as const;

  const testConfig = new StackConfig(testConfigFields);

  it("should decode target specs when the command provides plain recipe input", () => {
    const spec = Schema.decodeSync(RecipeSpec)({
      targets: [
        {
          target: { kind: "server", name: "api" },
          modules: ["server-http-api"],
        },
        {
          target: { kind: "client-react", name: "web" },
          modules: ["client-react-vite"],
        },
      ],
    });

    assert.strictEqual(spec.targets[0]?.target.toKey(), "apps/server-api");
    assert.deepStrictEqual(spec.targets[0]?.modules, [
      ModuleId.make("server-http-api"),
    ]);
    assert.strictEqual(
      spec.targets[1]?.target.toKey(),
      "apps/client-react-web",
    );
  });

  it("should decode provider strategy variants when recipe resolution options are parsed", () => {
    const strategyOf = (providerStrategy: unknown) =>
      Schema.decodeUnknownSync(RecipeResolveOptions)({
        config: testConfig,
        providerStrategy,
      }).providerStrategy;

    assert.deepStrictEqual(strategyOf({ _tag: "fail-on-ambiguous" }), {
      _tag: "fail-on-ambiguous",
    });
    assert.deepStrictEqual(strategyOf({ _tag: "first-provider" }), {
      _tag: "first-provider",
    });

    const explicit = strategyOf({
      _tag: "explicit",
      providers: [
        {
          target: { kind: "package", name: "db" },
          capability: "db-sql",
          moduleId: "package-db-postgres",
        },
      ],
    });

    if (explicit._tag !== "explicit") {
      assert.fail("Expected explicit provider strategy.");
    }

    assert.strictEqual(explicit.providers[0]?.target.toKey(), "packages/db");
    assert.strictEqual(
      explicit.providers[0]?.capability,
      ModuleCapability.make("db-sql"),
    );
  });

  it("should decode resolve options when config and provider strategy are provided", () => {
    const options = Schema.decodeSync(RecipeResolveOptions)({
      config: testConfig,
      providerStrategy: { _tag: "first-provider" },
    });

    assert.strictEqual(options.config.name, testConfig.name);
    assert.deepStrictEqual(options.providerStrategy, {
      _tag: "first-provider",
    });
  });
});
