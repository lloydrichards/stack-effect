import { assert, describe, layer } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import {
  type CatalogFragment,
  ModuleCapability,
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import type {
  RecipeProviderStrategy,
  RecipeTargetSpec,
} from "@repo/domain/Recipe";
import type { Selection } from "@repo/domain/Selection";
import { StackConfig } from "@repo/domain/StackConfig";
import { BlueprintResolver } from "@repo/scaffold/Blueprint";
import { RecipeResolver } from "@repo/scaffold/Recipe";
import { Effect, Layer, Schema } from "effect";
import { module, ProviderCatalogLayer, target } from "./fixtures/scaffold";

// A custom-only source keeps official workspace tools out of the selection.
const config = Schema.decodeUnknownSync(StackConfig)({
  name: "provider-project",
  runtime: { _tag: "bun" },
  catalogs: [{ name: "providers", url: "https://example.test/providers.json" }],
});

const recipeTarget = (
  kind: string,
  name: string,
  ...modules: ReadonlyArray<string>
): RecipeTargetSpec => ({
  target: new TargetIdentity({ kind: TargetKind.make(kind), name }),
  modules: modules.map((id) => ModuleId.make(id)),
});

const resolve = (
  targets: ReadonlyArray<RecipeTargetSpec>,
  providerStrategy: RecipeProviderStrategy = { _tag: "fail-on-ambiguous" },
) =>
  Effect.gen(function* () {
    const recipes = yield* RecipeResolver;
    return yield* recipes.resolve({ targets }, { config, providerStrategy });
  });

const modulesOn = (selection: Selection, targetKey: string) =>
  selection.targets
    .find((target) => target.identity.toKey() === targetKey)
    ?.modules.map((module) => module.id);

const resolveLayer = <E>(catalog: Layer.Layer<CatalogService, E>) =>
  Layer.merge(RecipeResolver.layer, BlueprintResolver.layer).pipe(
    Layer.provide(catalog),
  );

const TestLayer = resolveLayer(ProviderCatalogLayer);

const sqlProvider = (id: string, ...kinds: ReadonlyArray<string>) =>
  module(id, "package", {
    supportedOn: kinds.map((kind) => ({
      _tag: "kind" as const,
      kind: TargetKind.make(kind),
    })),
    provides: [ModuleCapability.make("sql")],
  });

const requiresSql = (
  kind: string,
  name: string,
): ModuleDefinition["dependencies"][number] => ({
  _tag: "required-capability",
  target: new TargetIdentity({ kind: TargetKind.make(kind), name }),
  capability: ModuleCapability.make("sql"),
});

/**
 * A custom source, listed first, that contributes another `sql` provider to
 * the official package target. Official modules cannot reference it.
 */
const SourcesCatalogLayer = CatalogService.fromFragments(
  [
    { targets: [], modules: [sqlProvider("sql-custom", "package")] },
    {
      targets: [target("workspace"), target("package")],
      modules: [
        sqlProvider("sql-official", "package"),
        module("official-repository", "package", {
          dependencies: [requiresSql("package", "db")],
        }),
      ],
    },
  ] satisfies ReadonlyArray<CatalogFragment>,
  {
    sources: [
      { name: "custom", requires: ["official"] },
      { name: "official", requires: [] },
    ],
  },
);

/**
 * `sql-first` precedes `sql-required`, which modules and the `db` target
 * attach as a hard dependency.
 */
const HardDependencyCatalogLayer = CatalogService.fromFragments([
  {
    targets: [
      target("workspace"),
      target("package"),
      target("db", { requiredModules: [ModuleId.make("sql-required")] }),
    ],
    modules: [
      sqlProvider("sql-first", "package", "db"),
      sqlProvider("sql-required", "package", "db"),
      module("hard-repository", "package", {
        dependencies: [
          {
            _tag: "required-module",
            target: new TargetIdentity({
              kind: TargetKind.make("package"),
              name: "db",
            }),
            moduleId: ModuleId.make("sql-required"),
          },
          requiresSql("package", "db"),
        ],
      }),
      module("db-repository", "db", {
        dependencies: [requiresSql("db", "main")],
      }),
    ],
  } satisfies CatalogFragment,
]);

const strategies: ReadonlyArray<RecipeProviderStrategy> = [
  { _tag: "fail-on-ambiguous" },
  { _tag: "first-provider" },
];

describe("RecipeResolver", () => {
  layer(TestLayer)("resolve", (it) => {
    it.effect(
      "should add the only provider when a selected module requires a capability",
      () =>
        Effect.gen(function* () {
          const selection = yield* resolve([
            recipeTarget("package", "cache", "cache-redis"),
          ]);

          assert.deepStrictEqual(modulesOn(selection, "packages/secrets"), [
            ModuleId.make("secrets-env"),
          ]);

          const blueprints = yield* BlueprintResolver;
          const blueprint = yield* blueprints.resolve(selection, config);
          assert.isTrue(
            blueprint.nodes.some(
              (node) => node.id === "packages/secrets#secrets-env",
            ),
          );
        }),
    );

    it.effect(
      "should add providers for modules it reaches through dependencies and added providers",
      () =>
        Effect.gen(function* () {
          const selection = yield* resolve([
            recipeTarget("server", "api", "server-sessions"),
          ]);

          assert.deepStrictEqual(modulesOn(selection, "packages/cache"), [
            ModuleId.make("cache-redis"),
          ]);
          assert.deepStrictEqual(modulesOn(selection, "packages/secrets"), [
            ModuleId.make("secrets-env"),
          ]);
          assert.strictEqual(
            modulesOn(selection, "packages/sessions"),
            undefined,
          );
        }),
    );

    it.effect(
      "should fail with the candidates when several modules provide a capability",
      () =>
        Effect.gen(function* () {
          const error = yield* resolve([
            recipeTarget("package", "db", "todo-repository"),
          ]).pipe(Effect.flip);

          assert.strictEqual(error._tag, "AmbiguousRecipeProvider");
          if (error._tag !== "AmbiguousRecipeProvider") return;
          assert.strictEqual(error.requestingModuleId, "todo-repository");
          assert.strictEqual(error.target.toKey(), "packages/db");
          assert.strictEqual(error.capability, "db-sql");
          assert.deepStrictEqual(
            error.providers.map((provider) => provider.moduleId),
            ["sql-sqlite", "sql-postgres"],
          );
        }),
    );

    it.effect(
      "should fail when no provider supports the configured runtime",
      () =>
        Effect.gen(function* () {
          const error = yield* resolve([
            recipeTarget("package", "metrics", "metrics"),
          ]).pipe(Effect.flip);

          assert.strictEqual(error._tag, "MissingRecipeProvider");
          if (error._tag !== "MissingRecipeProvider") return;
          assert.strictEqual(error.requestingModuleId, "metrics");
          assert.strictEqual(error.target.toKey(), "packages/telemetry");
          assert.strictEqual(error.capability, "telemetry");
        }),
    );

    it.effect(
      "should add the first provider in catalog order with the first-provider strategy",
      () =>
        Effect.gen(function* () {
          const selection = yield* resolve(
            [recipeTarget("package", "db", "todo-repository")],
            { _tag: "first-provider" },
          );

          assert.deepStrictEqual(modulesOn(selection, "packages/db"), [
            ModuleId.make("todo-repository"),
            ModuleId.make("sql-sqlite"),
          ]);
        }),
    );

    it.effect(
      "should keep the selection when the recipe already selects a provider",
      () =>
        Effect.gen(function* () {
          const selection = yield* resolve([
            recipeTarget("package", "db", "todo-repository", "sql-postgres"),
          ]);

          assert.deepStrictEqual(modulesOn(selection, "packages/db"), [
            ModuleId.make("todo-repository"),
            ModuleId.make("sql-postgres"),
          ]);
        }),
    );

    it.effect(
      "should add the provider an explicit strategy names among several candidates",
      () =>
        Effect.gen(function* () {
          const selection = yield* resolve(
            [recipeTarget("package", "db", "todo-repository")],
            {
              _tag: "explicit",
              providers: [
                {
                  target: recipeTarget("package", "db").target,
                  capability: ModuleCapability.make("db-sql"),
                  moduleId: ModuleId.make("sql-postgres"),
                },
              ],
            },
          );

          assert.deepStrictEqual(modulesOn(selection, "packages/db"), [
            ModuleId.make("todo-repository"),
            ModuleId.make("sql-postgres"),
          ]);
        }),
    );

    it.effect(
      "should reject an explicit provider that cannot provide the capability on that target",
      () =>
        Effect.gen(function* () {
          const error = yield* resolve(
            [recipeTarget("package", "db", "todo-repository")],
            {
              _tag: "explicit",
              providers: [
                {
                  target: recipeTarget("package", "db").target,
                  capability: ModuleCapability.make("db-sql"),
                  moduleId: ModuleId.make("telemetry-deno"),
                },
              ],
            },
          ).pipe(Effect.flip);

          assert.strictEqual(error._tag, "InvalidRecipeProvider");
          if (error._tag !== "InvalidRecipeProvider") return;
          assert.strictEqual(error.moduleId, "telemetry-deno");
          assert.deepStrictEqual(
            error.providers.map((provider) => provider.moduleId),
            ["sql-sqlite", "sql-postgres"],
          );
        }),
    );
  });

  layer(resolveLayer(SourcesCatalogLayer))("resolve across sources", (it) => {
    it.effect(
      "should consider only providers the requesting module's source may reference",
      () =>
        Effect.gen(function* () {
          for (const strategy of strategies) {
            const selection = yield* resolve(
              [recipeTarget("package", "db", "official-repository")],
              strategy,
            );

            assert.deepStrictEqual(
              modulesOn(selection, "packages/db"),
              [
                ModuleId.make("official-repository"),
                ModuleId.make("sql-official"),
              ],
              strategy._tag,
            );
          }
        }),
    );
  });

  layer(resolveLayer(HardDependencyCatalogLayer))(
    "resolve with hard dependencies",
    (it) => {
      it.effect(
        "should select the hard-required provider instead of choosing another",
        () =>
          Effect.gen(function* () {
            const blueprints = yield* BlueprintResolver;
            const cases = [
              {
                recipe: recipeTarget("package", "db", "hard-repository"),
                targetKey: "packages/db",
              },
              {
                recipe: recipeTarget("db", "main", "db-repository"),
                targetKey: recipeTarget("db", "main").target.toKey(),
              },
            ];

            for (const strategy of strategies) {
              for (const { recipe, targetKey } of cases) {
                const selection = yield* resolve([recipe], strategy);

                const providers = modulesOn(selection, targetKey)?.filter(
                  (id) => id.startsWith("sql-"),
                );
                assert.deepStrictEqual(
                  providers,
                  [ModuleId.make("sql-required")],
                  `${strategy._tag} ${targetKey}`,
                );
                yield* blueprints.resolve(selection, config);
              }
            }
          }),
      );
    },
  );
});
