import { assert, describe, it } from "@effect/vitest";
import { TargetIdentity, TargetKey, TargetKind } from "@repo/domain/Catalog";
import {
  ContributionTokenContext,
  STACK_CONFIG_SCHEMA_URL,
  StackConfig,
} from "@repo/domain/Scaffold";
import { Schema } from "effect";

describe("@repo/domain Scaffold", () => {
  it("preserves literal replacement characters in README recipes and workspace descriptions", () => {
    const identity = new TargetIdentity({
      kind: TargetKind.make("package"),
      name: "sdk/client",
    });
    const recipe =
      "bunx stack-effect@latest create sdk --catalog 'mine=https://example.com/catalog.json?q=$&'";
    const context = new ContributionTokenContext({
      targetKey: identity.toKey(),
      identity,
      config: new StackConfig({ name: "sdk", runtime: { _tag: "bun" } }),
      scaffoldRecipe: recipe,
      projectTargets: [{ identity, description: "Price $& guide" }],
    });
    assert.strictEqual(context.resolve("{{scaffoldRecipe}}"), recipe);
    assert.include(context.resolve("{{workspaceTargets}}"), "Price $& guide");
    assert.strictEqual(
      context.resolve("{{projectRoot}}/README.md"),
      "../../../README.md",
    );
  });

  it("should resolve path tokens and flat npm names when the target name is nested", () => {
    const identity = new TargetIdentity({
      kind: TargetKind.make("package"),
      name: "sdk/client",
    });
    const context = new ContributionTokenContext({
      targetKey: identity.toKey(),
      identity,
      config: new StackConfig({
        name: Schema.NonEmptyString.make("sdk"),
        runtime: { _tag: "bun" },
      }),
    });
    assert.strictEqual(
      context.resolve("{{targetPath}}/src {{targetDir}} {{packageName}}"),
      "packages/sdk/client/src packages/sdk/client @repo/sdk-client",
    );
  });
  it("accepts realistic target identities users are expected to provide", () => {
    const packageIdentity = Schema.decodeSync(TargetIdentity)({
      kind: "package",
      name: "domain",
    });
    const serverIdentity = Schema.decodeSync(TargetIdentity)({
      kind: "server",
      name: "api",
    });
    const clientIdentity = Schema.decodeSync(TargetIdentity)({
      kind: "client-react",
      name: "admin-ui",
    });

    assert.strictEqual(packageIdentity.toKey(), "packages/domain");
    assert.strictEqual(packageIdentity.toPath(), "packages/domain");
    assert.strictEqual(serverIdentity.toKey(), "apps/server-api");
    assert.strictEqual(clientIdentity.toPath(), "apps/client-react-admin-ui");
  });

  it("accepts empty target names for apps (uses kind only)", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "server",
      name: "",
    });

    assert.strictEqual(identity.toKey(), "apps/server");
    assert.strictEqual(identity.toPath(), "apps/server");
    assert.strictEqual(identity.toPackageName(), "server");
  });

  it("should reject a target identity when its name is a dot", () => {
    assert.throws(() =>
      Schema.decodeSync(TargetIdentity)({ kind: "client-react", name: "." }),
    );
  });

  it("slugifies uppercase names into canonical keys and paths", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "server",
      name: "API",
    });

    assert.strictEqual(identity.toKey(), "apps/server-api");
    assert.strictEqual(identity.toPath(), "apps/server-api");
  });

  it("slugifies names with spaces into canonical keys and paths", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "server",
      name: "SDK/My API",
    });

    assert.strictEqual(identity.toKey(), "apps/sdk/server-my-api");
    assert.strictEqual(identity.toPath(), "apps/sdk/server-my-api");
  });

  it("should preserve slash-separated hierarchy when deriving canonical keys and paths", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "package",
      name: "domain/core",
    });

    assert.strictEqual(identity.toKey(), "packages/domain/core");
    assert.strictEqual(identity.toPath(), "packages/domain/core");
    assert.strictEqual(identity.toPackageName(), "@repo/domain-core");
  });

  it("slugifies names with underscores into canonical keys and paths", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "client-react",
      name: "admin_ui",
    });

    assert.strictEqual(identity.toKey(), "apps/client-react-admin-ui");
    assert.strictEqual(identity.toPath(), "apps/client-react-admin-ui");
  });

  it("normalizes surrounding whitespace before deriving canonical keys and paths", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "server",
      name: "  SDK/My Api  ",
    });

    assert.strictEqual(identity.toKey(), "apps/sdk/server-my-api");
    assert.strictEqual(identity.toPath(), "apps/sdk/server-my-api");
  });

  describe("toPackageName", () => {
    it("returns scoped name for packages", () => {
      const identity = Schema.decodeSync(TargetIdentity)({
        kind: "package",
        name: "domain",
      });
      assert.strictEqual(identity.toPackageName(), "@repo/domain");
    });

    it("returns kind-name for apps with names", () => {
      const serverIdentity = Schema.decodeSync(TargetIdentity)({
        kind: "server",
        name: "api",
      });
      const clientIdentity = Schema.decodeSync(TargetIdentity)({
        kind: "client-react",
        name: "web",
      });

      assert.strictEqual(serverIdentity.toPackageName(), "server-api");
      assert.strictEqual(clientIdentity.toPackageName(), "client-react-web");
    });

    it("returns just kind for apps without names", () => {
      const serverIdentity = Schema.decodeSync(TargetIdentity)({
        kind: "server",
        name: "",
      });
      const clientIdentity = Schema.decodeSync(TargetIdentity)({
        kind: "client-react",
        name: "",
      });

      assert.strictEqual(serverIdentity.toPackageName(), "server");
      assert.strictEqual(clientIdentity.toPackageName(), "client-react");
    });

    it("slugifies package names", () => {
      const identity = Schema.decodeSync(TargetIdentity)({
        kind: "package",
        name: "Domain Core",
      });
      assert.strictEqual(identity.toPackageName(), "@repo/domain-core");
    });

    it("slugifies app names", () => {
      const identity = Schema.decodeSync(TargetIdentity)({
        kind: "server",
        name: "My API",
      });
      assert.strictEqual(identity.toPackageName(), "server-my-api");
    });
  });

  it("accepts arbitrary target kinds (extensible)", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "worker",
      name: "jobs",
    });

    assert.strictEqual(identity.toKey(), "apps/worker-jobs");
    assert.strictEqual(identity.toPath(), "apps/worker-jobs");
    assert.strictEqual(identity.toPackageName(), "worker-jobs");
  });
});

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

describe("ContributionTokenContext.resolve", () => {
  const makeContext = (configOverrides: Partial<StackConfig> = {}) =>
    new ContributionTokenContext({
      targetKey: TargetKey.make("apps/server-api"),
      identity: new TargetIdentity({
        kind: TargetKind.make("server"),
        name: "api",
      }),
      config: new StackConfig({
        name: "my-project",
        runtime: { _tag: "bun" },
        ...configOverrides,
      }),
    });

  it("selects template branches using modules attached to this target", () => {
    const template =
      "{{#if module=package-library}}public{{/if}}{{#if noModule=package-library}}private{{/if}}";
    const base = makeContext();
    assert.strictEqual(base.resolve(template), "private");
    assert.strictEqual(
      new ContributionTokenContext({
        targetKey: base.targetKey,
        identity: base.identity,
        config: base.config,
        moduleIds: ["package-library"],
      }).resolve(template),
      "public",
    );
    assert.strictEqual(
      new ContributionTokenContext({
        targetKey: base.targetKey,
        identity: base.identity,
        config: base.config,
        moduleIds: ["other"],
      }).resolve(template),
      "private",
    );
  });

  describe("simple tokens", () => {
    it("resolves {{lint}} token", () => {
      const ctx = makeContext({ lint: "biome" });
      assert.strictEqual(ctx.resolve("{{lint}}"), "biome");
    });

    it("resolves {{format}} token", () => {
      const ctx = makeContext({ format: "dprint" });
      assert.strictEqual(ctx.resolve("{{format}}"), "dprint");
    });

    it("resolves {{test}} token", () => {
      const ctx = makeContext({ test: "vitest" });
      assert.strictEqual(ctx.resolve("{{test}}"), "vitest");
    });

    it("resolves {{monorepo}} token", () => {
      const ctx = makeContext({ monorepo: "turbo" });
      assert.strictEqual(ctx.resolve("{{monorepo}}"), "turbo");
    });

    it("resolves {{typescript}} token", () => {
      const ctx = makeContext({ typescript: "7" });
      assert.strictEqual(ctx.resolve("{{typescript}}"), "7");
    });

    it("resolves workspace dependencies for Bun", () => {
      assert.strictEqual(
        makeContext().resolve("{{workspaceDependency}}"),
        "workspace:*",
      );
    });

    it("resolves workspace dependencies for pnpm", () => {
      const ctx = makeContext({
        runtime: { _tag: "node", packageManager: "pnpm" },
      });
      assert.strictEqual(ctx.resolve("{{workspaceDependency}}"), "workspace:*");
    });

    it("resolves workspace dependencies for npm", () => {
      const ctx = makeContext({
        runtime: { _tag: "node", packageManager: "npm" },
      });
      assert.strictEqual(ctx.resolve("{{workspaceDependency}}"), "*");
    });

    it("resolves undefined config fields to empty string", () => {
      const ctx = makeContext({});
      assert.strictEqual(ctx.resolve("{{lint}}"), "");
      assert.strictEqual(ctx.resolve("{{format}}"), "");
      assert.strictEqual(ctx.resolve("{{test}}"), "");
      assert.strictEqual(ctx.resolve("{{monorepo}}"), "");
      assert.strictEqual(ctx.resolve("{{typescript}}"), "6");
    });
  });

  describe("truthy conditionals", () => {
    it("includes content when field is set", () => {
      const ctx = makeContext({ lint: "biome" });
      assert.strictEqual(
        ctx.resolve("{{#if lint}}has lint{{/if}}"),
        "has lint",
      );
    });

    it("excludes content when field is undefined", () => {
      const ctx = makeContext({});
      assert.strictEqual(ctx.resolve("{{#if lint}}has lint{{/if}}"), "");
    });

    it("excludes content when field is empty string", () => {
      const ctx = makeContext({ lint: "" });
      assert.strictEqual(ctx.resolve("{{#if lint}}has lint{{/if}}"), "");
    });
  });

  describe("computed Effect Oxlint conditionals", () => {
    const template =
      "{{#if effectOxlint}}effect{{/if}}/{{#if standaloneOxlint}}standalone{{/if}}/{{#if standaloneEffectOxlint}}standalone-effect{{/if}}/{{#if typescript7Diagnostics}}typescript{{/if}}";

    it("enables Effect Oxlint and its standalone variant for TS7 outside Vite+", () => {
      const ctx = makeContext({
        typescript: "7",
        lint: "oxlint",
        monorepo: "turbo",
      });

      assert.strictEqual(
        ctx.resolve(template),
        "effect/standalone/standalone-effect/",
      );
    });

    it("enables Effect Oxlint but not its standalone variant for TS7 Vite+", () => {
      const ctx = makeContext({
        typescript: "7",
        lint: "oxlint",
        monorepo: "vite-plus",
      });

      assert.strictEqual(ctx.resolve(template), "effect///");
    });

    it("disables Effect Oxlint for TS6 with Oxlint", () => {
      const ctx = makeContext({ typescript: "6", lint: "oxlint" });

      assert.strictEqual(ctx.resolve(template), "/standalone//");
    });

    it("disables Effect Oxlint for TS7 with a different linter", () => {
      const ctx = makeContext({ typescript: "7", lint: "biome" });

      assert.strictEqual(ctx.resolve(template), "///typescript");
    });

    it("enables standalone Oxlint when monorepo is omitted", () => {
      const ctx = makeContext({ typescript: "7", lint: "oxlint" });

      assert.strictEqual(
        ctx.resolve(template),
        "effect/standalone/standalone-effect/",
      );
    });
  });

  describe("equality conditionals", () => {
    it("selects the native workspace task when no monorepo tool is configured", () => {
      assert.strictEqual(
        makeContext({}).resolve(
          "{{#if monorepo}}external{{/if}}{{#if noMonorepo}}native{{/if}}",
        ),
        "native",
      );
      assert.strictEqual(
        makeContext({ monorepo: "nx" }).resolve(
          "{{#if monorepo}}external{{/if}}{{#if noMonorepo}}native{{/if}}",
        ),
        "external",
      );
    });

    it("should resolve an equality conditional when its value contains a hyphen", () => {
      const ctx = makeContext({ monorepo: "vite-plus" });
      assert.strictEqual(
        ctx.resolve(
          "{{#if monorepo=vite-plus}}node_modules/.vite/task-cache{{/if}}",
        ),
        "node_modules/.vite/task-cache",
      );
    });

    it("includes content when field equals value", () => {
      const ctx = makeContext({ lint: "biome" });
      assert.strictEqual(
        ctx.resolve("{{#if lint=biome}}is biome{{/if}}"),
        "is biome",
      );
    });

    it("excludes content when field does not equal value", () => {
      const ctx = makeContext({ lint: "oxlint" });
      assert.strictEqual(ctx.resolve("{{#if lint=biome}}is biome{{/if}}"), "");
    });

    it("excludes content when field is undefined", () => {
      const ctx = makeContext({});
      assert.strictEqual(ctx.resolve("{{#if lint=biome}}is biome{{/if}}"), "");
    });

    it("works with runtime field", () => {
      const bunCtx = makeContext({});
      assert.strictEqual(
        bunCtx.resolve("{{#if runtime=bun}}is bun{{/if}}"),
        "is bun",
      );

      const nodeCtx = new ContributionTokenContext({
        targetKey: TargetKey.make("apps/server-api"),
        identity: new TargetIdentity({
          kind: TargetKind.make("server"),
          name: "api",
        }),
        config: new StackConfig({
          name: "my-project",
          runtime: { _tag: "node", packageManager: "pnpm" },
        }),
      });
      assert.strictEqual(
        nodeCtx.resolve("{{#if runtime=bun}}is bun{{/if}}"),
        "",
      );
      assert.strictEqual(
        nodeCtx.resolve("{{#if runtime=node}}is node{{/if}}"),
        "is node",
      );
    });
  });

  describe("unknown fields", () => {
    it("treats unknown field as falsy in truthy check", () => {
      const ctx = makeContext({ lint: "biome" });
      assert.strictEqual(ctx.resolve("{{#if unknown}}content{{/if}}"), "");
    });

    it("treats unknown field as falsy in equality check", () => {
      const ctx = makeContext({ lint: "biome" });
      assert.strictEqual(
        ctx.resolve("{{#if unknown=value}}content{{/if}}"),
        "",
      );
    });
  });

  describe("multiple conditionals", () => {
    it("resolves multiple conditionals in same template", () => {
      const ctx = makeContext({ lint: "biome", format: "biome" });
      const template = `{{#if lint=biome}}lint-biome{{/if}} {{#if format=biome}}format-biome{{/if}}`;
      assert.strictEqual(ctx.resolve(template), "lint-biome format-biome");
    });

    it("handles mixed true and false conditionals", () => {
      const ctx = makeContext({ lint: "biome", format: "dprint" });
      const template = `{{#if lint=biome}}lint-biome{{/if}} {{#if format=biome}}format-biome{{/if}}`;
      assert.strictEqual(ctx.resolve(template), "lint-biome ");
    });
  });

  describe("multiline content", () => {
    it("preserves multiline content in conditionals", () => {
      const ctx = makeContext({ lint: "biome" });
      const template = `{{#if lint=biome}}line1
line2
line3{{/if}}`;
      assert.strictEqual(
        ctx.resolve(template),
        `line1
line2
line3`,
      );
    });
  });
});
