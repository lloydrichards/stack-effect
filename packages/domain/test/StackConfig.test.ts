import { assert, describe, it } from "@effect/vitest";
import {
  defaultsForRuntime,
  STACK_CONFIG_SCHEMA_URL,
  StackConfig,
} from "@repo/domain/StackConfig";
import { Schema } from "effect";

describe("StackConfig TypeScript version", () => {
  it("should keep the TypeScript version when a config names a supported major", () => {
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

  it("should default to TypeScript 6 when an existing config has no TypeScript version", () => {
    const config = Schema.decodeSync(StackConfig)({
      name: "existing-project",
      runtime: { _tag: "bun" },
    });

    assert.isUndefined(config.typescript);
    assert.strictEqual(config.typescriptVersion, "6");
  });

  it("should reject the config when it names an unsupported TypeScript major", () => {
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
  it("should use Deno as the package manager with workspace dependencies when the runtime is Deno", () => {
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

  it("should keep the configured defaults when the runtime is Bun or Node", () => {
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

  it("should clear monorepo, lint, and format and use TypeScript 6 when the runtime is Deno", () => {
    assert.deepStrictEqual(defaultsForRuntime(defaults, "deno"), {
      typescript: "6",
      monorepo: undefined,
      lint: undefined,
      format: undefined,
      test: "vitest",
    });
  });
});
