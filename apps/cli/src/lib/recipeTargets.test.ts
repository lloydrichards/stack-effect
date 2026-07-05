import { assert, describe, it } from "@effect/vitest";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { Schema } from "effect";
import { RecipeTargetString } from "./recipeTargets";

describe("RecipeTargetString", () => {
  it("decodes compact target specs", () => {
    const decoded = Schema.decodeUnknownSync(RecipeTargetString)(
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
        ModuleId.make("package-ai-toolkit-math"),
      ],
    });

    assert.strictEqual(
      encoded,
      "package/ai:package-ai-chat-service,package-ai-toolkit-math",
    );
  });

  it("normalizes whitespace while decoding", () => {
    const decoded = Schema.decodeUnknownSync(RecipeTargetString)(
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
    const decoded = Schema.decodeUnknownSync(RecipeTargetString)(
      "server/:server-chat-rpc",
    );
    const encoded = Schema.encodeUnknownSync(RecipeTargetString)(decoded);

    assert.deepStrictEqual(decoded, {
      target: new TargetIdentity({ kind: TargetKind.make("server"), name: "" }),
      modules: [ModuleId.make("server-chat-rpc")],
    });
    assert.strictEqual(encoded, "server/:server-chat-rpc");
  });

  it("rejects malformed target specs", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(RecipeTargetString)("server/api"),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(RecipeTargetString)(":server-http-api"),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(RecipeTargetString)("server/api:"),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(RecipeTargetString)(" /api:server-http-api"),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(RecipeTargetString)("server/api:,"),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(RecipeTargetString)("server:server-http-api"),
    );
  });
});
