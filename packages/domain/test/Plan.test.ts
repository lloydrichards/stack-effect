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
  const baseline = {
    root: "/workspace",
    paths: [
      { _tag: "missing", path: RepositoryPath.make("README.md") },
      { _tag: "missing", path: RepositoryPath.make("package.json") },
    ],
  } as const;
  it("should accept the four classifications and reject any other value when decoding an outcome", () => {
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

  it("should order outcomes, baseline paths, and same-path diagnostics canonically when a Plan is sorted", () => {
    const plan = new Plan({
      baseline: {
        root: "/workspace",
        paths: [
          { _tag: "missing", path: RepositoryPath.make("z.txt") },
          { _tag: "file", path: RepositoryPath.make("a.txt"), sha256: "abc" },
          ...[
            "packages/domain/src/Api.ts",
            "apps/web/src/App.tsx",
            "packages/domain/tsconfig.json",
            "packages/domain/src/index.ts",
          ].map((path) => ({
            _tag: "file" as const,
            path: RepositoryPath.make(path),
            sha256: "abc",
          })),
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
      [
        "a.txt",
        "apps/web/src/App.tsx",
        "packages/domain/src/Api.ts",
        "packages/domain/src/index.ts",
        "packages/domain/tsconfig.json",
        "z.txt",
      ],
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

  const decodePlan = Schema.decodeUnknownSync(Plan);
  const invalidPlans: ReadonlyArray<{
    readonly name: string;
    readonly message: string;
    readonly decode: () => Plan;
  }> = [
    {
      name: "duplicate baseline paths",
      message: "duplicate path: README.md",
      decode: () =>
        decodePlan({
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
      message: "Plan outcome paths must be unique",
      decode: () =>
        decodePlan({
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
      message: "duplicate scripts conflict at package.json",
      decode: () =>
        decodePlan({
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
      message: "must reference a conflicted outcome: README.md",
      decode: () =>
        decodePlan({
          baseline,
          outcomes: [],
          conflicts: [
            { _tag: "completeFile", path: RepositoryPath.make("README.md") },
          ],
        }),
    },
    {
      name: "conflicted outcomes without diagnostics",
      message: "must have at least one conflict diagnostic: README.md",
      decode: () =>
        decodePlan({
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
    {
      name: "outcomes outside the baseline",
      message: "Plan baseline does not cover docs/guide.md",
      decode: () =>
        decodePlan({
          baseline,
          outcomes: [
            {
              _tag: "complete",
              path: RepositoryPath.make("docs/guide.md"),
              classification: "create",
              contents: "# Guide\n",
            },
          ],
          conflicts: [],
        }),
    },
  ];

  it.each(invalidPlans)(
    "should name the broken invariant when a Plan has $name",
    ({ decode, message }) => {
      assert.throws(decode, message);
    },
  );
});

describe("ContributionTokenContext.resolve", () => {
  const nested = new TargetIdentity({
    kind: TargetKind.make("package"),
    name: "sdk/client",
  });

  it("should keep replacement characters literal when the recipe or a workspace description contains $&", () => {
    const recipe =
      "bunx stack-effect@latest create sdk --catalog 'mine=https://example.com/catalog.json?q=$&'";
    const context = new ContributionTokenContext({
      targetKey: nested.toKey(),
      identity: nested,
      config: new StackConfig({ name: "sdk", runtime: { _tag: "bun" } }),
      scaffoldRecipe: recipe,
      projectTargets: [{ identity: nested, description: "Price $& guide" }],
    });

    assert.strictEqual(context.resolve("{{scaffoldRecipe}}"), recipe);
    assert.include(context.resolve("{{workspaceTargets}}"), "Price $& guide");
  });

  it("should resolve path tokens and a flat npm name when the target name is nested", () => {
    const context = new ContributionTokenContext({
      targetKey: nested.toKey(),
      identity: nested,
      config: new StackConfig({ name: "sdk", runtime: { _tag: "bun" } }),
    });

    assert.strictEqual(
      context.resolve("{{targetPath}}/src {{targetDir}} {{packageName}}"),
      "packages/sdk/client/src packages/sdk/client @repo/sdk-client",
    );
    assert.strictEqual(
      context.resolve("{{projectRoot}}/README.md"),
      "../../../README.md",
    );
  });

  const makeContext = (
    configOverrides: Partial<StackConfig> = {},
    moduleIds?: ReadonlyArray<string>,
  ) =>
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
      moduleIds,
    });

  const node = (packageManager: "pnpm" | "npm") =>
    ({ runtime: { _tag: "node", packageManager } }) as const;

  it.each([
    {
      label: "lint is set",
      config: { lint: "biome" },
      token: "{{lint}}",
      expected: "biome",
    },
    {
      label: "format is set",
      config: { format: "dprint" },
      token: "{{format}}",
      expected: "dprint",
    },
    {
      label: "test is set",
      config: { test: "vitest" },
      token: "{{test}}",
      expected: "vitest",
    },
    {
      label: "monorepo is set",
      config: { monorepo: "turbo" },
      token: "{{monorepo}}",
      expected: "turbo",
    },
    {
      label: "typescript is set",
      config: { typescript: "7" },
      token: "{{typescript}}",
      expected: "7",
    },
    { label: "lint is unset", config: {}, token: "{{lint}}", expected: "" },
    { label: "format is unset", config: {}, token: "{{format}}", expected: "" },
    { label: "test is unset", config: {}, token: "{{test}}", expected: "" },
    {
      label: "monorepo is unset",
      config: {},
      token: "{{monorepo}}",
      expected: "",
    },
    {
      label: "typescript is unset",
      config: {},
      token: "{{typescript}}",
      expected: "6",
    },
    {
      label: "the runtime is Bun",
      config: {},
      token: "{{workspaceDependency}}",
      expected: "workspace:*",
    },
    {
      label: "the package manager is pnpm",
      config: node("pnpm"),
      token: "{{workspaceDependency}}",
      expected: "workspace:*",
    },
    {
      label: "the package manager is npm",
      config: node("npm"),
      token: "{{workspaceDependency}}",
      expected: "*",
    },
  ] as const)(
    "should resolve $token to '$expected' when $label",
    ({ config, token, expected }) => {
      assert.strictEqual(makeContext(config).resolve(token), expected);
    },
  );

  it.each([
    {
      label: "the field is set",
      config: { lint: "biome" },
      template: "{{#if lint}}yes{{/if}}",
      expected: "yes",
    },
    {
      label: "the field is unset",
      config: {},
      template: "{{#if lint}}yes{{/if}}",
      expected: "",
    },
    {
      label: "the field is an empty string",
      config: { lint: "" },
      template: "{{#if lint}}yes{{/if}}",
      expected: "",
    },
    {
      label: "the field is unknown",
      config: { lint: "biome" },
      template: "{{#if unknown}}yes{{/if}}",
      expected: "",
    },
    {
      label: "the field equals the value",
      config: { lint: "biome" },
      template: "{{#if lint=biome}}yes{{/if}}",
      expected: "yes",
    },
    {
      label: "the field differs from the value",
      config: { lint: "oxlint" },
      template: "{{#if lint=biome}}yes{{/if}}",
      expected: "",
    },
    {
      label: "the compared field is unset",
      config: {},
      template: "{{#if lint=biome}}yes{{/if}}",
      expected: "",
    },
    {
      label: "the compared field is unknown",
      config: { lint: "biome" },
      template: "{{#if unknown=value}}yes{{/if}}",
      expected: "",
    },
    {
      label: "the value contains a hyphen",
      config: { monorepo: "vite-plus" },
      template: "{{#if monorepo=vite-plus}}yes{{/if}}",
      expected: "yes",
    },
    {
      label: "the runtime is Bun and the condition names bun",
      config: {},
      template: "{{#if runtime=bun}}yes{{/if}}",
      expected: "yes",
    },
    {
      label: "the runtime is Node and the condition names bun",
      config: node("pnpm"),
      template: "{{#if runtime=bun}}yes{{/if}}",
      expected: "",
    },
    {
      label: "the runtime is Node and the condition names node",
      config: node("pnpm"),
      template: "{{#if runtime=node}}yes{{/if}}",
      expected: "yes",
    },
  ] as const)(
    "should resolve $template to '$expected' when $label",
    ({ config, template, expected }) => {
      assert.strictEqual(makeContext(config).resolve(template), expected);
    },
  );

  it.each([
    {
      label: "no modules are attached",
      moduleIds: undefined,
      expected: "private",
    },
    {
      label: "the named module is attached",
      moduleIds: ["package-library"],
      expected: "public",
    },
    {
      label: "only another module is attached",
      moduleIds: ["other"],
      expected: "private",
    },
  ])(
    "should select the '$expected' branch when $label",
    ({ moduleIds, expected }) => {
      assert.strictEqual(
        makeContext({}, moduleIds).resolve(
          "{{#if module=package-library}}public{{/if}}{{#if noModule=package-library}}private{{/if}}",
        ),
        expected,
      );
    },
  );

  it.each([
    { label: "no monorepo tool is configured", config: {}, expected: "native" },
    {
      label: "a monorepo tool is configured",
      config: { monorepo: "nx" },
      expected: "external",
    },
  ])(
    "should select the $expected workspace task when $label",
    ({ config, expected }) => {
      assert.strictEqual(
        makeContext(config).resolve(
          "{{#if monorepo}}external{{/if}}{{#if noMonorepo}}native{{/if}}",
        ),
        expected,
      );
    },
  );

  it.each([
    {
      label: "TypeScript 7 uses Oxlint outside Vite+",
      config: { typescript: "7", lint: "oxlint", monorepo: "turbo" },
      expected: "effect/standalone/standalone-effect/",
    },
    {
      label: "TypeScript 7 uses Oxlint inside Vite+",
      config: { typescript: "7", lint: "oxlint", monorepo: "vite-plus" },
      expected: "effect///",
    },
    {
      label: "TypeScript 7 uses Oxlint with no monorepo tool",
      config: { typescript: "7", lint: "oxlint" },
      expected: "effect/standalone/standalone-effect/",
    },
    {
      label: "TypeScript 6 uses Oxlint",
      config: { typescript: "6", lint: "oxlint" },
      expected: "/standalone//",
    },
    {
      label: "TypeScript 7 uses another linter",
      config: { typescript: "7", lint: "biome" },
      expected: "///typescript",
    },
  ] as const)(
    "should derive the Oxlint and diagnostics flags '$expected' when $label",
    ({ config, expected }) => {
      assert.strictEqual(
        makeContext(config).resolve(
          "{{#if effectOxlint}}effect{{/if}}/{{#if standaloneOxlint}}standalone{{/if}}/{{#if standaloneEffectOxlint}}standalone-effect{{/if}}/{{#if typescript7Diagnostics}}typescript{{/if}}",
        ),
        expected,
      );
    },
  );

  it.each([
    {
      label: "every condition holds",
      config: { lint: "biome", format: "biome" },
      expected: "lint-biome format-biome",
    },
    {
      label: "only one condition holds",
      config: { lint: "biome", format: "dprint" },
      expected: "lint-biome ",
    },
  ] as const)(
    "should resolve each conditional independently when $label",
    ({ config, expected }) => {
      assert.strictEqual(
        makeContext(config).resolve(
          "{{#if lint=biome}}lint-biome{{/if}} {{#if format=biome}}format-biome{{/if}}",
        ),
        expected,
      );
    },
  );

  it("should keep every line when a conditional body spans lines", () => {
    assert.strictEqual(
      makeContext({ lint: "biome" }).resolve(
        "{{#if lint=biome}}line1\nline2\nline3{{/if}}",
      ),
      "line1\nline2\nline3",
    );
  });
});
