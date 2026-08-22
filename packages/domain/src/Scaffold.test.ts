import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  GenerationDomainAdapterId,
  TargetIdentity,
  TargetKey,
  TargetKind,
} from "./Catalog";
import { ContributionTokenContext, StackConfig } from "./Scaffold";

describe("@repo/domain Scaffold", () => {
  it("accepts realistic target identities users are expected to provide", () => {
    const packageIdentity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "package",
      name: "domain",
    });
    const serverIdentity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "server",
      name: "api",
    });
    const clientIdentity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "client-react",
      name: "admin-ui",
    });

    expect(packageIdentity.toKey()).toBe("packages/domain");
    expect(packageIdentity.toPath()).toBe("packages/domain");
    expect(serverIdentity.toKey()).toBe("apps/server-api");
    expect(clientIdentity.toPath()).toBe("apps/client-react-admin-ui");
  });

  it("accepts empty target names for apps (uses kind only)", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "server",
      name: "",
    });

    expect(identity.toKey()).toBe("apps/server");
    expect(identity.toPath()).toBe("apps/server");
    expect(identity.toPackageName()).toBe("server");
  });

  it("treats punctuation-only app target names as unnamed", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "client-react",
      name: ".",
    });

    expect(identity.hasExplicitName()).toBe(false);
    expect(identity.toKey()).toBe("apps/client-react");
    expect(identity.toPath()).toBe("apps/client-react");
    expect(identity.toPackageName()).toBe("client-react");
  });

  it("slugifies uppercase names into canonical keys and paths", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "server",
      name: "API",
    });

    expect(identity.toKey()).toBe("apps/server-api");
    expect(identity.toPath()).toBe("apps/server-api");
  });

  it("slugifies names with spaces into canonical keys and paths", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "server",
      name: "my api",
    });

    expect(identity.toKey()).toBe("apps/server-my-api");
    expect(identity.toPath()).toBe("apps/server-my-api");
  });

  it("slugifies names with slashes into canonical keys and paths", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "package",
      name: "domain/core",
    });

    expect(identity.toKey()).toBe("packages/domain-core");
    expect(identity.toPath()).toBe("packages/domain-core");
  });

  it("slugifies names with underscores into canonical keys and paths", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "client-react",
      name: "admin_ui",
    });

    expect(identity.toKey()).toBe("apps/client-react-admin-ui");
    expect(identity.toPath()).toBe("apps/client-react-admin-ui");
  });

  it("normalizes surrounding whitespace before deriving canonical keys and paths", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "server",
      name: "  My Api  ",
    });

    expect(identity.toKey()).toBe("apps/server-my-api");
    expect(identity.toPath()).toBe("apps/server-my-api");
  });

  describe("toPackageName", () => {
    it("returns scoped name for packages", () => {
      const identity = Schema.decodeUnknownSync(TargetIdentity)({
        kind: "package",
        name: "domain",
      });
      expect(identity.toPackageName()).toBe("@repo/domain");
    });

    it("returns kind-name for apps with names", () => {
      const serverIdentity = Schema.decodeUnknownSync(TargetIdentity)({
        kind: "server",
        name: "api",
      });
      const clientIdentity = Schema.decodeUnknownSync(TargetIdentity)({
        kind: "client-react",
        name: "web",
      });

      expect(serverIdentity.toPackageName()).toBe("server-api");
      expect(clientIdentity.toPackageName()).toBe("client-react-web");
    });

    it("returns just kind for apps without names", () => {
      const serverIdentity = Schema.decodeUnknownSync(TargetIdentity)({
        kind: "server",
        name: "",
      });
      const clientIdentity = Schema.decodeUnknownSync(TargetIdentity)({
        kind: "client-react",
        name: "",
      });

      expect(serverIdentity.toPackageName()).toBe("server");
      expect(clientIdentity.toPackageName()).toBe("client-react");
    });

    it("slugifies package names", () => {
      const identity = Schema.decodeUnknownSync(TargetIdentity)({
        kind: "package",
        name: "Domain Core",
      });
      expect(identity.toPackageName()).toBe("@repo/domain-core");
    });

    it("slugifies app names", () => {
      const identity = Schema.decodeUnknownSync(TargetIdentity)({
        kind: "server",
        name: "My API",
      });
      expect(identity.toPackageName()).toBe("server-my-api");
    });
  });

  it("accepts arbitrary target kinds (extensible)", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "worker",
      name: "jobs",
    });

    expect(identity.toKey()).toBe("apps/worker-jobs");
    expect(identity.toPath()).toBe("apps/worker-jobs");
    expect(identity.toPackageName()).toBe("worker-jobs");
  });
});

describe("StackConfig TypeScript version", () => {
  it("accepts supported TypeScript major versions", () => {
    const typescript6 = Schema.decodeUnknownSync(StackConfig)({
      name: "typescript-6",
      runtime: { _tag: "bun" },
      typescript: "6",
    });
    const typescript7 = Schema.decodeUnknownSync(StackConfig)({
      name: "typescript-7",
      runtime: { _tag: "bun" },
      typescript: "7",
    });

    expect(typescript6.typescript).toBe("6");
    expect(typescript7.typescript).toBe("7");
  });

  it("keeps existing configs without a TypeScript version decodable", () => {
    const config = Schema.decodeUnknownSync(StackConfig)({
      name: "existing-project",
      runtime: { _tag: "bun" },
    });

    expect(config.typescript).toBeUndefined();
    expect(config.typescriptVersion).toBe("6");
  });

  it("rejects unsupported TypeScript major versions", () => {
    expect(() =>
      Schema.decodeUnknownSync(StackConfig)({
        name: "unsupported-version",
        runtime: { _tag: "bun" },
        typescript: "8",
      }),
    ).toThrow();
  });
});

describe("ContributionTokenContext.resolve", () => {
  const makeContext = (
    configOverrides: Partial<typeof StackConfig.Type> = {},
  ) =>
    new ContributionTokenContext({
      targetKey: TargetKey.make("apps/server-api"),
      identity: new TargetIdentity({
        kind: TargetKind.make("server"),
        name: "api",
      }),
      config: new StackConfig({
        name: "my-project" as typeof Schema.NonEmptyString.Type,
        runtime: { _tag: "bun" },
        ...configOverrides,
      }),
    });

  describe("simple tokens", () => {
    it("resolves {{lint}} token", () => {
      const ctx = makeContext({ lint: "biome" });
      expect(ctx.resolve("{{lint}}")).toBe("biome");
    });

    it("resolves {{format}} token", () => {
      const ctx = makeContext({ format: "dprint" });
      expect(ctx.resolve("{{format}}")).toBe("dprint");
    });

    it("resolves {{test}} token", () => {
      const ctx = makeContext({ test: "vitest" });
      expect(ctx.resolve("{{test}}")).toBe("vitest");
    });

    it("resolves {{monorepo}} token", () => {
      const ctx = makeContext({ monorepo: "turbo" });
      expect(ctx.resolve("{{monorepo}}")).toBe("turbo");
    });

    it("resolves {{typescript}} token", () => {
      const ctx = makeContext({ typescript: "7" });
      expect(ctx.resolve("{{typescript}}")).toBe("7");
    });

    it("resolves workspace dependencies for Bun", () => {
      expect(makeContext().resolve("{{workspaceDependency}}")).toBe(
        "workspace:*",
      );
    });

    it("resolves workspace dependencies for pnpm", () => {
      const ctx = makeContext({
        runtime: { _tag: "node", packageManager: "pnpm" },
      });
      expect(ctx.resolve("{{workspaceDependency}}")).toBe("workspace:*");
    });

    it("resolves workspace dependencies for npm", () => {
      const ctx = makeContext({
        runtime: { _tag: "node", packageManager: "npm" },
      });
      expect(ctx.resolve("{{workspaceDependency}}")).toBe("*");
    });

    it("resolves undefined config fields to empty string", () => {
      const ctx = makeContext({});
      expect(ctx.resolve("{{lint}}")).toBe("");
      expect(ctx.resolve("{{format}}")).toBe("");
      expect(ctx.resolve("{{test}}")).toBe("");
      expect(ctx.resolve("{{monorepo}}")).toBe("");
      expect(ctx.resolve("{{typescript}}")).toBe("6");
    });
  });

  describe("truthy conditionals", () => {
    it("includes content when field is set", () => {
      const ctx = makeContext({ lint: "biome" });
      expect(ctx.resolve("{{#if lint}}has lint{{/if}}")).toBe("has lint");
    });

    it("excludes content when field is undefined", () => {
      const ctx = makeContext({});
      expect(ctx.resolve("{{#if lint}}has lint{{/if}}")).toBe("");
    });

    it("excludes content when field is empty string", () => {
      const ctx = makeContext({ lint: "" });
      expect(ctx.resolve("{{#if lint}}has lint{{/if}}")).toBe("");
    });
  });

  describe("equality conditionals", () => {
    it("should resolve an equality conditional when its value contains a hyphen", () => {
      const ctx = makeContext({ monorepo: "vite-plus" });
      expect(
        ctx.resolve(
          "{{#if monorepo=vite-plus}}node_modules/.vite/task-cache{{/if}}",
        ),
      ).toBe("node_modules/.vite/task-cache");
    });

    it("includes content when field equals value", () => {
      const ctx = makeContext({ lint: "biome" });
      expect(ctx.resolve("{{#if lint=biome}}is biome{{/if}}")).toBe("is biome");
    });

    it("excludes content when field does not equal value", () => {
      const ctx = makeContext({ lint: "oxlint" });
      expect(ctx.resolve("{{#if lint=biome}}is biome{{/if}}")).toBe("");
    });

    it("excludes content when field is undefined", () => {
      const ctx = makeContext({});
      expect(ctx.resolve("{{#if lint=biome}}is biome{{/if}}")).toBe("");
    });

    it("works with runtime field", () => {
      const bunCtx = makeContext({});
      expect(bunCtx.resolve("{{#if runtime=bun}}is bun{{/if}}")).toBe("is bun");

      const nodeCtx = new ContributionTokenContext({
        targetKey: TargetKey.make("apps/server-api"),
        identity: new TargetIdentity({
          kind: TargetKind.make("server"),
          name: "api",
        }),
        config: new StackConfig({
          name: "my-project" as typeof Schema.NonEmptyString.Type,
          runtime: { _tag: "node", packageManager: "pnpm" },
        }),
      });
      expect(nodeCtx.resolve("{{#if runtime=bun}}is bun{{/if}}")).toBe("");
      expect(nodeCtx.resolve("{{#if runtime=node}}is node{{/if}}")).toBe(
        "is node",
      );
    });
  });

  describe("unknown fields", () => {
    it("treats unknown field as falsy in truthy check", () => {
      const ctx = makeContext({ lint: "biome" });
      expect(ctx.resolve("{{#if unknown}}content{{/if}}")).toBe("");
    });

    it("treats unknown field as falsy in equality check", () => {
      const ctx = makeContext({ lint: "biome" });
      expect(ctx.resolve("{{#if unknown=value}}content{{/if}}")).toBe("");
    });
  });

  describe("multiple conditionals", () => {
    it("resolves multiple conditionals in same template", () => {
      const ctx = makeContext({ lint: "biome", format: "biome" });
      const template = `{{#if lint=biome}}lint-biome{{/if}} {{#if format=biome}}format-biome{{/if}}`;
      expect(ctx.resolve(template)).toBe("lint-biome format-biome");
    });

    it("handles mixed true and false conditionals", () => {
      const ctx = makeContext({ lint: "biome", format: "dprint" });
      const template = `{{#if lint=biome}}lint-biome{{/if}} {{#if format=biome}}format-biome{{/if}}`;
      expect(ctx.resolve(template)).toBe("lint-biome ");
    });
  });

  describe("multiline content", () => {
    it("preserves multiline content in conditionals", () => {
      const ctx = makeContext({ lint: "biome" });
      const template = `{{#if lint=biome}}line1
line2
line3{{/if}}`;
      expect(ctx.resolve(template)).toBe(`line1
line2
line3`);
    });
  });
  it("resolves canonical deployment paths and deterministic distinct identity hashes", () => {
    const makeContext = (projectName: string, targetName: string) => {
      const identity = new TargetIdentity({
        kind: TargetKind.make("client-react"),
        name: targetName,
      });
      return new ContributionTokenContext({
        targetKey: identity.toKey(),
        identity,
        config: new StackConfig({
          name: projectName,
          runtime: { _tag: "bun" },
          infrastructure: "cloudflare",
        }),
        generationDomainAdapterId: GenerationDomainAdapterId.make(
          "cloudflare-website-vite",
        ),
      });
    };
    const first = makeContext("acme", "web");
    const repeated = makeContext("acme", "web");
    const second = makeContext("acme", "admin");

    expect(first.resolve("{{targetPath}}:{{stableIdentityHash}}")).toBe(
      repeated.resolve("{{targetPath}}:{{stableIdentityHash}}"),
    );
    expect(first.resolve("{{targetPath}}")).toBe("apps/client-react-web");
    expect(second.resolve("{{targetPath}}")).toBe("apps/client-react-admin");
    expect(first.resolve("{{stableIdentityHash}}")).not.toBe(
      second.resolve("{{stableIdentityHash}}"),
    );
  });

  it("resolves provider-safe names without changing canonical identity tokens", () => {
    const identity = new TargetIdentity({
      kind: TargetKind.make("client-react"),
      name: 'Admin "UI"',
    });
    const context = new ContributionTokenContext({
      targetKey: identity.toKey(),
      identity,
      config: new StackConfig({
        name: 'Acme "Cloud"',
        runtime: { _tag: "bun" },
        infrastructure: "cloudflare",
      }),
      generationDomainAdapterId: GenerationDomainAdapterId.make(
        "cloudflare-website-vite",
      ),
    });

    expect(
      context.resolve("{{providerSafeProjectName}}:{{providerSafeTargetName}}"),
    ).toBe(
      "se-encoded-acme-cloud-x41636d652022436c6f756422:se-encoded-admin-ui-x41646d696e2022554922",
    );
    expect(context.resolve("{{targetKey}}:{{targetPath}}")).toBe(
      "apps/client-react-admin-ui:apps/client-react-admin-ui",
    );
  });

  it("encodes UTF-8 exactly while keeping Unicode names provider safe", () => {
    const identity = new TargetIdentity({
      kind: TargetKind.make("client-react"),
      name: "管理 UI",
    });
    const context = new ContributionTokenContext({
      targetKey: identity.toKey(),
      identity,
      config: new StackConfig({
        name: "Café ☁",
        runtime: { _tag: "bun" },
        infrastructure: "cloudflare",
      }),
      generationDomainAdapterId: GenerationDomainAdapterId.make(
        "cloudflare-website-vite",
      ),
    });
    const resolved = context.resolve(
      "{{providerSafeProjectName}}:{{providerSafeTargetName}}",
    );

    expect(resolved).toMatch(
      /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/,
    );
    expect(resolved).toContain("se-encoded-caf-x436166c3a920e29881");
    expect(resolved).toContain("se-encoded-ui-xe7aea1e79086205549");
  });

  it("reserves an encoded namespace for exact project and target names", () => {
    const resolveNames = (projectName: string, targetName: string) => {
      const identity = new TargetIdentity({
        kind: TargetKind.make("client-react"),
        name: targetName,
      });
      const context = new ContributionTokenContext({
        targetKey: identity.toKey(),
        identity,
        config: new StackConfig({
          name: projectName,
          runtime: { _tag: "bun" },
          infrastructure: "cloudflare",
        }),
        generationDomainAdapterId: GenerationDomainAdapterId.make(
          "cloudflare-website-vite",
        ),
      });

      return context
        .resolve(
          "{{providerSafeProjectName}}:{{providerSafeTargetName}}:{{targetPath}}:{{stableIdentityHash}}",
        )
        .split(":");
    };

    expect(resolveNames("!", "!").slice(0, 2)).toEqual([
      "se-encoded-project-x21",
      "se-encoded-client-react-x21",
    ]);
    expect(resolveNames("project-x-21", "project-x-21").slice(0, 2)).toEqual([
      "project-x-21",
      "project-x-21",
    ]);
    expect(resolveNames("A", "A").slice(0, 2)).toEqual([
      "se-encoded-a-x41",
      "se-encoded-a-x41",
    ]);
    expect(resolveNames("a-x-41", "a-x-41").slice(0, 2)).toEqual([
      "a-x-41",
      "a-x-41",
    ]);

    const reserved = resolveNames(
      "se-encoded-project-x21",
      "se-encoded-client-react-x21",
    );
    expect(reserved.slice(0, 2)).toEqual([
      "se-encoded-se-encoded-project-x-21-x73652d656e636f6465642d70726f6a6563742d783231",
      "se-encoded-se-encoded-client-react-x-21-x73652d656e636f6465642d636c69656e742d72656163742d783231",
    ]);
  });

  it("encodes accepted whitespace target names without collapsing raw bytes", () => {
    const resolveTarget = (targetName: string) => {
      const identity = new TargetIdentity({
        kind: TargetKind.make("client-react"),
        name: targetName,
      });
      const context = new ContributionTokenContext({
        targetKey: identity.toKey(),
        identity,
        config: new StackConfig({
          name: "stack-effect",
          runtime: { _tag: "bun" },
          infrastructure: "cloudflare",
        }),
        generationDomainAdapterId: GenerationDomainAdapterId.make(
          "cloudflare-website-vite",
        ),
      });

      const [providerName, targetPath, hash] = context
        .resolve(
          "{{providerSafeTargetName}}:{{targetPath}}:{{stableIdentityHash}}",
        )
        .split(":");
      return { providerName, targetPath, hash };
    };

    const variants = ["", " ", "\t"].map(resolveTarget);
    expect(variants.map(({ providerName }) => providerName)).toEqual([
      "se-encoded-client-react-x",
      "se-encoded-client-react-x20",
      "se-encoded-client-react-x09",
    ]);
    expect(variants.map(({ targetPath }) => targetPath)).toEqual([
      "apps/client-react",
      "apps/client-react",
      "apps/client-react",
    ]);
    expect(new Set(variants.map(({ hash }) => hash))).toHaveLength(1);
  });
});
