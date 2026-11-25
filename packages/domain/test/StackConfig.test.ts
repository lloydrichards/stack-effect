import { assert, describe, it } from "@effect/vitest";
import { CatalogSources } from "@repo/domain/Catalog";
import {
  defaultsForRuntime,
  makeRuntime,
  STACK_CONFIG_SCHEMA_URL,
  StackConfig,
  toTypeScriptModuleId,
  toWorkspaceModuleId,
  toWorkspaceToolValue,
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

  it("should default to TypeScript 6 when no default names a version", () => {
    const { typescript: _, ...unversioned } = defaults;

    assert.strictEqual(defaultsForRuntime(unversioned, "bun").typescript, "6");
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

describe("StackConfig runtime", () => {
  it.each([
    {
      label: "Bun",
      runtime: "bun",
      packageManager: "bun",
      expected: { _tag: "bun" },
    },
    {
      label: "Deno",
      runtime: "deno",
      packageManager: "deno",
      expected: { _tag: "deno" },
    },
    {
      label: "Node with npm",
      runtime: "node",
      packageManager: "npm",
      expected: { _tag: "node", packageManager: "npm" },
    },
    {
      label: "Node with pnpm",
      runtime: "node",
      packageManager: "pnpm",
      expected: { _tag: "node", packageManager: "pnpm" },
    },
    {
      label: "Node with a non-Node package manager",
      runtime: "node",
      packageManager: "bun",
      expected: { _tag: "node", packageManager: "pnpm" },
    },
  ] as const)(
    "should build the runtime config when the project uses $label",
    ({ runtime, packageManager, expected }) => {
      assert.deepStrictEqual(makeRuntime(runtime, packageManager), expected);
    },
  );
});

describe("StackConfig catalog sources", () => {
  const sources = Schema.decodeUnknownSync(CatalogSources);
  const acme = { name: "acme", url: "https://catalog.acme.dev/v1.json" };
  const customOnly = sources([acme]);
  const mixed = sources([{ name: "official" }, acme]);
  const config = Schema.decodeSync(StackConfig)({
    $schema: STACK_CONFIG_SCHEMA_URL,
    name: "project",
    runtime: { _tag: "node", packageManager: "npm" },
    typescript: "7",
    lint: "biome",
    format: "biome",
    test: "vitest",
    monorepo: "turbo",
  });

  it("should select only the official catalog when a config names no catalogs", () => {
    assert.deepStrictEqual(config.catalogSources, [{ name: "official" }]);
    assert.strictEqual(config.usesOfficialCatalog, true);
  });

  it("should not use the official catalog when the saved selection is custom only", () => {
    const custom = config.withCatalogs(customOnly);

    assert.deepStrictEqual(custom.catalogSources, customOnly);
    assert.strictEqual(custom.usesOfficialCatalog, false);
  });

  it("should use the official catalog when the saved selection mixes official and custom sources", () => {
    assert.strictEqual(config.withCatalogs(mixed).usesOfficialCatalog, true);
  });

  it("should keep every other setting when catalogs are replaced", () => {
    const replaced = config.withCatalogs(mixed);
    const settings = Object.keys(StackConfig.fields).filter(
      (field): field is Exclude<keyof typeof StackConfig.fields, "catalogs"> =>
        field !== "catalogs",
    );

    assert.deepStrictEqual(replaced.catalogs, mixed);
    for (const field of settings) {
      assert.deepStrictEqual(replaced[field], config[field], field);
    }
  });
});

describe("StackConfig workspace modules", () => {
  it.each([
    {
      category: "lint",
      tool: "biome",
      moduleId: "workspace-quality-biome-lint",
    },
    {
      category: "format",
      tool: "biome",
      moduleId: "workspace-quality-biome-format",
    },
    { category: "format", tool: "oxfmt", moduleId: "workspace-quality-oxfmt" },
    { category: "lint", tool: "oxlint", moduleId: "workspace-quality-oxlint" },
    {
      category: "format",
      tool: "dprint",
      moduleId: "workspace-quality-dprint",
    },
    { category: "tool", tool: "turbo", moduleId: "workspace-monorepo-turbo" },
    { category: "tool", tool: "vitest", moduleId: "workspace-test-vitest" },
  ] as const)(
    "should map $category tool $tool to $moduleId and back",
    ({ category, tool, moduleId }) => {
      assert.strictEqual(toWorkspaceModuleId(category, tool), moduleId);
      assert.strictEqual(toWorkspaceToolValue(moduleId), tool);
    },
  );

  it("should pass a custom catalog's tool and module ids through unchanged when they are not official", () => {
    assert.strictEqual(toWorkspaceModuleId("lint", "acme-lint"), "acme-lint");
    assert.strictEqual(toWorkspaceToolValue("acme-lint"), "acme-lint");
  });

  it.each([
    { version: "6", moduleId: "workspace-typescript-6" },
    { version: "7", moduleId: "workspace-typescript-7" },
  ] as const)(
    "should select $moduleId when the config uses TypeScript $version",
    ({ version, moduleId }) => {
      assert.strictEqual(toTypeScriptModuleId(version), moduleId);
    },
  );
});
