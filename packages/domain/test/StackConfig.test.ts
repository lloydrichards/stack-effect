import { assert, describe, it } from "@effect/vitest";
import {
  defaultsForRuntime,
  STACK_CONFIG_SCHEMA_URL,
  StackConfig,
} from "@repo/domain/StackConfig";
import { Schema } from "effect";

describe("StackConfig TypeScript version", () => {
  it("accepts supported TypeScript major versions", () => {
    const typescript6 = Schema.decodeSync(StackConfig)({
      name: "typescript-6",
      runtime: { _tag: "bun" },
      typescript: "6",
    });
    const typescript7 = Schema.decodeSync(StackConfig)({
      name: "typescript-7",
      runtime: { _tag: "bun" },
      typescript: "7",
    });

    assert.strictEqual(typescript6.typescript, "6");
    assert.strictEqual(typescript7.typescript, "7");
  });

  it("keeps existing configs without a TypeScript version decodable", () => {
    const config = Schema.decodeSync(StackConfig)({
      name: "existing-project",
      runtime: { _tag: "bun" },
    });

    assert.isUndefined(config.typescript);
    assert.strictEqual(config.typescriptVersion, "6");
  });

  it("rejects unsupported TypeScript major versions", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(StackConfig)({
        name: "unsupported-version",
        runtime: { _tag: "bun" },
        typescript: "8",
      }),
    );
  });
});

describe("StackConfig editor schema metadata", () => {
  it("should keep $schema optional when a config omits it or uses the canonical editor URL", () => {
    const old = Schema.decodeSync(StackConfig)({
      name: "old-project",
      runtime: { _tag: "bun" },
    });
    const annotated = Schema.decodeSync(StackConfig)({
      $schema: STACK_CONFIG_SCHEMA_URL,
      name: "annotated-project",
      runtime: { _tag: "bun" },
    });

    assert.isUndefined(old.$schema);
    assert.strictEqual(annotated.$schema, STACK_CONFIG_SCHEMA_URL);
  });
});

describe("StackConfig Deno runtime", () => {
  it("decodes Deno with Deno-owned package and workspace commands", () => {
    const config = Schema.decodeSync(StackConfig)({
      name: "deno-project",
      runtime: { _tag: "deno" },
      typescript: "6",
    });

    assert.strictEqual(config.runtimeName, "deno");
    assert.strictEqual(config.packageManagerName, "deno");
    assert.strictEqual(config.workspaceDependency, "workspace:*");
  });
});

describe("StackConfigDefaults", () => {
  const defaults = {
    name: "example",
    runtime: { _tag: "bun" as const },
    typescript: "7" as const,
    monorepo: "vite-plus",
    lint: "oxlint",
    format: "oxfmt",
    test: "vitest",
  };

  it("keeps the configured defaults for Bun and Node", () => {
    for (const runtime of ["bun", "node"] as const) {
      assert.deepStrictEqual(defaultsForRuntime(defaults, runtime), {
        typescript: "7",
        monorepo: "vite-plus",
        lint: "oxlint",
        format: "oxfmt",
        test: "vitest",
      });
    }
  });

  it("uses Deno defaults without copying unrelated configuration fields", () => {
    assert.deepStrictEqual(defaultsForRuntime(defaults, "deno"), {
      typescript: "6",
      monorepo: undefined,
      lint: undefined,
      format: undefined,
      test: "vitest",
    });
  });
});
