import { assert, describe, it } from "@effect/vitest";
import { TargetIdentity, TargetKey, TargetKind } from "@repo/domain/Catalog";
import {
  ContributionTokenContext,
  Plan,
  RepositoryPath,
} from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/StackConfig";
import { Schema } from "effect";

describe("@repo/domain Plan", () => {
  const baseline = { root: "/workspace", paths: [] } as const;
  it("should accept supported classifications and reject unsupported values", () => {
    const decodeOutcome = Schema.decodeUnknownSync(Plan.fields.outcomes.value);
    const outcome = (classification: string) => ({
      _tag: "complete",
      path: "package.json",
      classification,
      contents: "{}",
    });

    for (const classification of [
      "create",
      "modify",
      "unchanged",
      "conflict",
    ]) {
      assert.strictEqual(
        decodeOutcome(outcome(classification)).classification,
        classification,
      );
    }
    assert.throws(() => decodeOutcome(outcome("delete")));
  });

  it("should decode outcome and conflict fields independently", () => {
    const outcome = Schema.decodeSync(Plan.fields.outcomes.value)({
      _tag: "complete",
      path: "packages/domain/tsconfig.json",
      classification: "create",
      contents: '{"extends":"../../packages/config-typescript/base.json"}',
    });

    assert.strictEqual(outcome._tag, "complete");
    const conflict = Schema.decodeSync(Plan.fields.conflicts.value)({
      _tag: "completeFile",
      path: "package.json",
    });

    assert.strictEqual(conflict._tag, "completeFile");
  });

  it("should sort outcomes and distinct same-path diagnostics deterministically", () => {
    const plan = new Plan({
      baseline: {
        root: "/workspace",
        paths: [
          { _tag: "missing", path: RepositoryPath.make("z.txt") },
          { _tag: "file", path: RepositoryPath.make("a.txt"), sha256: "abc" },
        ],
      },
      outcomes: [
        {
          _tag: "complete",
          path: RepositoryPath.make("packages/domain/src/Api.ts"),
          classification: "create",
          contents: 'export const Api = "Api";\n',
        },
        {
          _tag: "complete",
          path: RepositoryPath.make("apps/web/src/App.tsx"),
          classification: "conflict",
          contents: "export const App = () => null;\n",
        },
        {
          _tag: "complete",
          path: RepositoryPath.make("packages/domain/tsconfig.json"),
          classification: "conflict",
          contents: "{}\n",
        },
        {
          _tag: "complete",
          path: RepositoryPath.make("packages/domain/src/index.ts"),
          classification: "conflict",
          contents: "export {};\n",
        },
      ],
      conflicts: [
        {
          _tag: "jsxSlotTargetNotFound",
          path: RepositoryPath.make("apps/web/src/App.tsx"),
          slotId: "footer",
        },
        {
          _tag: "jsxSlotTargetNotFound",
          path: RepositoryPath.make("apps/web/src/App.tsx"),
          slotId: "components",
        },
        {
          _tag: "tsconfig",
          path: RepositoryPath.make("packages/domain/tsconfig.json"),
        },
        {
          _tag: "completeFile",
          path: RepositoryPath.make("packages/domain/src/index.ts"),
        },
      ],
    }).toSorted();

    assert.deepStrictEqual(
      plan.outcomes.map((outcome) => outcome.path),
      [
        "apps/web/src/App.tsx",
        "packages/domain/src/Api.ts",
        "packages/domain/src/index.ts",
        "packages/domain/tsconfig.json",
      ],
    );
    assert.deepStrictEqual(
      plan.baseline.paths.map((entry) => entry.path),
      ["a.txt", "z.txt"],
    );
    assert.deepStrictEqual(
      plan.conflicts.map((conflict) => conflict.path),
      [
        "packages/domain/src/index.ts",
        "apps/web/src/App.tsx",
        "apps/web/src/App.tsx",
        "packages/domain/tsconfig.json",
      ],
    );
    assert.deepStrictEqual(plan.conflicts.slice(1, 3), [
      {
        _tag: "jsxSlotTargetNotFound",
        path: RepositoryPath.make("apps/web/src/App.tsx"),
        slotId: "components",
      },
      {
        _tag: "jsxSlotTargetNotFound",
        path: RepositoryPath.make("apps/web/src/App.tsx"),
        slotId: "footer",
      },
    ]);
  });

  const invalidPlans: ReadonlyArray<{
    readonly name: string;
    readonly construct: () => Plan;
  }> = [
    {
      name: "duplicate baseline paths",
      construct: () =>
        new Plan({
          baseline: {
            root: "/workspace",
            paths: [
              { _tag: "missing", path: RepositoryPath.make("README.md") },
              { _tag: "directory", path: RepositoryPath.make("README.md") },
            ],
          },
          outcomes: [],
          conflicts: [],
        }),
    },
    {
      name: "duplicate outcome paths",
      construct: () =>
        new Plan({
          baseline,
          outcomes: [
            {
              _tag: "complete",
              path: RepositoryPath.make("README.md"),
              classification: "create",
              contents: "# Repo\n",
            },
            {
              _tag: "complete",
              path: RepositoryPath.make("README.md"),
              classification: "modify",
              contents: "# Updated\n",
            },
          ],
          conflicts: [],
        }),
    },
    {
      name: "duplicate exact conflict diagnostics",
      construct: () =>
        new Plan({
          baseline,
          outcomes: [
            {
              _tag: "complete",
              path: RepositoryPath.make("package.json"),
              classification: "conflict",
              contents: "{}\n",
            },
          ],
          conflicts: [
            {
              _tag: "scripts",
              path: RepositoryPath.make("package.json"),
              name: "test",
            },
            {
              _tag: "scripts",
              path: RepositoryPath.make("package.json"),
              name: "test",
            },
          ],
        }),
    },
    {
      name: "orphan conflict diagnostics",
      construct: () =>
        new Plan({
          baseline,
          outcomes: [],
          conflicts: [
            { _tag: "completeFile", path: RepositoryPath.make("README.md") },
          ],
        }),
    },
    {
      name: "conflicted outcomes without diagnostics",
      construct: () =>
        new Plan({
          baseline,
          outcomes: [
            {
              _tag: "complete",
              path: RepositoryPath.make("README.md"),
              classification: "conflict",
              contents: "# Repo\n",
            },
          ],
          conflicts: [],
        }),
    },
  ];

  it("should reject invalid relationships during checked construction", () => {
    invalidPlans.forEach(({ construct, name }) => {
      assert.throws(construct, null, null, name);
    });
  });

  it("should reject invalid relationships when decoding", () => {
    assert.throws(() =>
      Schema.decodeSync(Plan)({
        baseline,
        outcomes: [],
        conflicts: [{ _tag: "completeFile", path: "README.md" }],
      }),
    );
  });
});

describe("ContributionTokenContext.resolve", () => {
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
