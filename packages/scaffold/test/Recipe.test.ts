import { assert, describe, it, layer } from "@effect/vitest";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import { CatalogReader } from "@repo/catalog/Catalog";
import {
  type CatalogFragment,
  ModuleCapability,
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  type RecipeProviderStrategy,
  type RecipeTargetSpec,
} from "@repo/domain/Recipe";
import type { Selection } from "@repo/domain/Selection";
import { StackConfig, StackConfigDefaults } from "@repo/domain/StackConfig";
import { BlueprintResolver } from "@repo/scaffold/Blueprint";
import { RecipeResolver } from "@repo/scaffold/Recipe";
import { Effect, Layer, Schema } from "effect";
import { module, ProviderCatalogLayer, target } from "./fixtures/scaffold";

describe("RecipeResolver", () => {
  // A custom-only source keeps official workspace tools out of the selection.
  const config = Schema.decodeUnknownSync(StackConfig)({
    name: "provider-project",
    runtime: { _tag: "bun" },
    catalogs: [
      { name: "providers", url: "https://example.test/providers.json" },
    ],
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

  const resolveLayer = <E>(catalog: Layer.Layer<CatalogReader, E>) =>
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

  const DefaultAppCatalogLayer = resolveLayer(
    CatalogReader.fromFragments([
      {
        targets: [
          target("workspace"),
          target("client"),
          target("server", { defaultName: "api" }),
        ],
        modules: [
          sqlProvider("sql-server", "server"),
          sqlProvider("sql-alternate", "server"),
          module("client-consumer", "client", {
            dependencies: [requiresSql("server", "api")],
          }),
          module("client-default-consumer", "client", {
            dependencies: [requiresSql("server", "")],
          }),
          module("client-custom-consumer", "client", {
            dependencies: [requiresSql("server", "backoffice")],
          }),
        ],
      },
    ]),
  );

  it.effect(
    "keeps app placement and provider choice when replaying a copied recipe",
    () =>
      Effect.gen(function* () {
        const recipes = yield* RecipeResolver;
        const blueprints = yield* BlueprintResolver;
        for (const [moduleId, recipeName, key] of [
          ["client-consumer", "", "apps/server-api"],
          ["client-default-consumer", "", "apps/server-api"],
          ["client-custom-consumer", "backoffice", "server:apps/backoffice"],
        ] as const) {
          const client = recipeTarget("client", "web", moduleId);
          const selection = yield* resolve([client], {
            _tag: "first-provider",
          });
          const command = recipes.renderCreateCommand({ config, selection });

          assert.deepStrictEqual(modulesOn(selection, key), [
            ModuleId.make("sql-server"),
          ]);
          assert.include(command, `--target server/${recipeName}:sql-server`);
          const replay = yield* resolve([
            client,
            recipeTarget("server", recipeName, "sql-server"),
          ]);
          assert.deepStrictEqual(
            yield* blueprints.resolve(replay, config),
            yield* blueprints.resolve(selection, config),
          );
        }
      }).pipe(Effect.provide(DefaultAppCatalogLayer)),
  );

  it.effect("keeps an explicit provider choice on a named app", () =>
    Effect.gen(function* () {
      const blueprints = yield* BlueprintResolver;
      const server = recipeTarget("server", "api");
      const selection = yield* resolve(
        [recipeTarget("client", "web", "client-consumer"), server],
        {
          _tag: "explicit",
          providers: [
            {
              target: server.target,
              capability: ModuleCapability.make("sql"),
              moduleId: ModuleId.make("sql-alternate"),
            },
          ],
        },
      );

      assert.deepStrictEqual(modulesOn(selection, "server:apps/api"), [
        ModuleId.make("sql-alternate"),
      ]);
      yield* blueprints.resolve(selection, config);
    }).pipe(Effect.provide(DefaultAppCatalogLayer)),
  );

  /**
   * A custom source, listed first, that contributes another `sql` provider to
   * the official package target. Official modules cannot reference it.
   */
  const SourcesCatalogLayer = CatalogReader.fromFragments(
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
  const HardDependencyCatalogLayer = CatalogReader.fromFragments([
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

  layer(TestLayer)("resolve", (it) => {
    it.effect(
      "should report a missing configured tool in a custom-only catalog",
      () =>
        Effect.gen(function* () {
          const recipes = yield* RecipeResolver;
          const recipe = { targets: [] };
          const providerStrategy = { _tag: "fail-on-ambiguous" as const };
          yield* recipes.resolve(recipe, { config, providerStrategy });

          const error = yield* Effect.flip(
            recipes.resolve(recipe, {
              config: new StackConfig({ ...config, lint: "biome" }),
              providerStrategy,
            }),
          );

          assert(error._tag === "InvalidRecipeSpec");
          assert.deepStrictEqual(
            error.issues.map(({ path }) => path),
            [["config"]],
          );
        }),
    );

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

    for (const [label, targetName, capability] of [
      ["another target", "analytics", "db-sql"],
      ["another capability", "db", "secrets"],
    ] as const) {
      it.effect(
        `should keep provider ambiguity when an explicit choice names ${label}`,
        () =>
          Effect.gen(function* () {
            const error = yield* Effect.flip(
              resolve([recipeTarget("package", "db", "todo-repository")], {
                _tag: "explicit",
                providers: [
                  {
                    target: recipeTarget("package", targetName).target,
                    capability: ModuleCapability.make(capability),
                    moduleId: ModuleId.make("sql-postgres"),
                  },
                ],
              }),
            );

            assert(error._tag === "AmbiguousRecipeProvider");
            assert.strictEqual(error.target.toKey(), "packages/db");
            assert.strictEqual(error.capability, "db-sql");
          }),
      );
    }

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
                targetKey: "db:apps/main",
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

describe("RecipeResolver with the official catalog", () => {
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

  const makeTestLayer = (defaults: StackConfig) =>
    RecipeResolver.layer.pipe(
      Layer.provide(OfficialCatalogLayer),
      Layer.provide(Layer.succeed(StackConfigDefaults, defaults)),
    );

  const TestLayer = makeTestLayer(testConfig);

  const modulesForTarget = (targets: Selection["targets"], targetKey: string) =>
    targets
      .find((target) => target.identity.toKey() === targetKey)
      ?.modules.map((module) => module.id);

  const assertTargetModules = (
    selection: Selection,
    targetKey: string,
    moduleIds: ReadonlyArray<ModuleId>,
  ) => {
    assert.deepStrictEqual(
      modulesForTarget(selection.targets, targetKey),
      moduleIds,
    );
  };

  describe("resolve", () => {
    it.effect("should select the Nx workspace module when configured", () =>
      Effect.gen(function* () {
        const service = yield* RecipeResolver;
        const config = new StackConfig({
          ...testConfigFields,
          monorepo: "nx",
        });
        const selection = yield* service.resolve(
          { targets: [] },
          {
            config,
            providerStrategy: { _tag: "fail-on-ambiguous" },
          },
        );

        assertTargetModules(selection, ".", [
          ModuleId.make("workspace-typescript-7"),
          ModuleId.make("workspace-monorepo-nx"),
          ModuleId.make("workspace-quality-oxlint"),
          ModuleId.make("workspace-quality-oxfmt"),
          ModuleId.make("workspace-test-vitest"),
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should select the Vite+ workspace module when configured", () =>
      Effect.gen(function* () {
        const service = yield* RecipeResolver;
        const config = new StackConfig({
          ...testConfigFields,
          monorepo: "vite-plus",
        });
        const selection = yield* service.resolve(
          { targets: [] },
          {
            config,
            providerStrategy: { _tag: "fail-on-ambiguous" },
          },
        );

        assertTargetModules(selection, ".", [
          ModuleId.make("workspace-typescript-7"),
          ModuleId.make("workspace-monorepo-vite-plus"),
          ModuleId.make("workspace-quality-oxlint"),
          ModuleId.make("workspace-quality-oxfmt"),
          ModuleId.make("workspace-test-vitest"),
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should return a Selection when recipe targets are requested",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const selection = yield* service.resolve(
            {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("server"),
                    name: "api",
                  }),
                  modules: [ModuleId.make("server-http-api")],
                },
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("package"),
                    name: "db",
                  }),
                  modules: [ModuleId.make("package-db-postgres")],
                },
              ],
            },
            {
              config: testConfig,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          assertTargetModules(selection, "server:apps/api", [
            ModuleId.make("server-http-api"),
          ]);
          assertTargetModules(selection, "packages/db", [
            ModuleId.make("package-db-postgres"),
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should seed workspace modules when StackConfig defines workspace tooling",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const selection = yield* service.resolve(
            {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("server"),
                    name: "api",
                  }),
                  modules: [ModuleId.make("server-http-api")],
                },
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("package"),
                    name: "db",
                  }),
                  modules: [ModuleId.make("package-db-postgres")],
                },
              ],
            },
            {
              config: testConfig,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          assertTargetModules(selection, ".", [
            ModuleId.make("workspace-typescript-7"),
            ModuleId.make("workspace-monorepo-vite-plus"),
            ModuleId.make("workspace-quality-oxlint"),
            ModuleId.make("workspace-quality-oxfmt"),
            ModuleId.make("workspace-test-vitest"),
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should select the TypeScript 6 workspace module when overridden",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const config = new StackConfig({
            ...testConfigFields,
            typescript: "6",
          });
          const selection = yield* service.resolve(
            { targets: [] },
            {
              config,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          assertTargetModules(selection, ".", [
            ModuleId.make("workspace-typescript-6"),
            ModuleId.make("workspace-monorepo-vite-plus"),
            ModuleId.make("workspace-quality-oxlint"),
            ModuleId.make("workspace-quality-oxfmt"),
            ModuleId.make("workspace-test-vitest"),
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should select independent lint and format modules when quality tools are configured",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const cases = [
            {
              lint: "biome",
              format: "dprint",
              modules: [
                "workspace-quality-biome-lint",
                "workspace-quality-dprint",
              ],
            },
            {
              lint: "biome",
              format: "oxfmt",
              modules: [
                "workspace-quality-biome-lint",
                "workspace-quality-oxfmt",
              ],
            },
            {
              lint: "oxlint",
              format: "oxfmt",
              modules: ["workspace-quality-oxlint", "workspace-quality-oxfmt"],
            },
          ] as const;

          yield* Effect.forEach(cases, ({ lint, format, modules }) =>
            service
              .resolve(
                { targets: [] },
                {
                  config: new StackConfig({
                    ...testConfigFields,
                    lint,
                    format,
                  }),
                  providerStrategy: { _tag: "fail-on-ambiguous" },
                },
              )
              .pipe(
                Effect.tap((selection) =>
                  Effect.sync(() =>
                    assertTargetModules(selection, ".", [
                      ModuleId.make("workspace-typescript-7"),
                      ModuleId.make("workspace-monorepo-vite-plus"),
                      ...modules.map((module) => ModuleId.make(module)),
                      ModuleId.make("workspace-test-vitest"),
                    ]),
                  ),
                ),
              ),
          );
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should add workspace target modules when the recipe explicitly targets the workspace",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const selection = yield* service.resolve(
            {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("workspace"),
                    name: "recipe-app",
                  }),
                  modules: [ModuleId.make("workspace-devenv-git")],
                },
              ],
            },
            {
              config: testConfig,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          assertTargetModules(selection, ".", [
            ModuleId.make("workspace-typescript-7"),
            ModuleId.make("workspace-monorepo-vite-plus"),
            ModuleId.make("workspace-quality-oxlint"),
            ModuleId.make("workspace-quality-oxfmt"),
            ModuleId.make("workspace-test-vitest"),
            ModuleId.make("workspace-devenv-git"),
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should normalize workspace target names when explicit workspace modules are requested",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const selection = yield* service.resolve(
            {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("workspace"),
                    name: "some-other-project-name",
                  }),
                  modules: [ModuleId.make("workspace-devenv-git")],
                },
              ],
            },
            {
              config: testConfig,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          assert.deepStrictEqual(
            selection.targets.map((target) => target.identity.toKey()),
            ["."],
          );
          assert.strictEqual(
            selection.targets[0]?.identity.toPackageName(),
            testConfig.name,
          );
          assertTargetModules(selection, ".", [
            ModuleId.make("workspace-typescript-7"),
            ModuleId.make("workspace-monorepo-vite-plus"),
            ModuleId.make("workspace-quality-oxlint"),
            ModuleId.make("workspace-quality-oxfmt"),
            ModuleId.make("workspace-test-vitest"),
            ModuleId.make("workspace-devenv-git"),
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should dedupe workspace modules when StackConfig and recipe targets overlap",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const selection = yield* service.resolve(
            {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("workspace"),
                    name: "recipe-app",
                  }),
                  modules: [
                    ModuleId.make("workspace-quality-oxlint"),
                    ModuleId.make("workspace-quality-oxfmt"),
                    ModuleId.make("workspace-devenv-git"),
                    ModuleId.make("workspace-devenv-git"),
                  ],
                },
              ],
            },
            {
              config: testConfig,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          assertTargetModules(selection, ".", [
            ModuleId.make("workspace-typescript-7"),
            ModuleId.make("workspace-monorepo-vite-plus"),
            ModuleId.make("workspace-quality-oxlint"),
            ModuleId.make("workspace-quality-oxfmt"),
            ModuleId.make("workspace-test-vitest"),
            ModuleId.make("workspace-devenv-git"),
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should use catalog defaults when app target names are empty",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const selection = yield* service.resolve(
            {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("client-react"),
                    name: "",
                  }),
                  modules: [ModuleId.make("client-react-http-api")],
                },
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("server"),
                    name: "",
                  }),
                  modules: [ModuleId.make("server-http-api")],
                },
              ],
            },
            {
              config: testConfig,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          assertTargetModules(selection, "apps/client-react-web", [
            ModuleId.make("client-react-http-api"),
          ]);
          assertTargetModules(selection, "apps/server-api", [
            ModuleId.make("server-http-api"),
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should reject two app kinds claiming the same named folder",
      () =>
        Effect.gen(function* () {
          const recipes = yield* RecipeResolver;
          const blueprints = yield* BlueprintResolver;
          const selection = yield* recipes.resolve(
            {
              targets: ["server", "docs"].map((kind) => ({
                target: new TargetIdentity({
                  kind: TargetKind.make(kind),
                  name: "shared",
                }),
                modules: [],
              })),
            },
            {
              config: testConfig,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          const failure = yield* Effect.flip(
            blueprints.resolve(selection, testConfig),
          );
          assert.include(failure.message, "Overlapping target ownership");
          assert.include(failure.message, "apps/shared");
        }).pipe(
          Effect.provide(
            Layer.merge(
              TestLayer,
              BlueprintResolver.layer.pipe(Layer.provide(OfficialCatalogLayer)),
            ),
          ),
        ),
    );

    it.effect(
      "should return only the configured workspace when the recipe has no targets",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const selection = yield* service.resolve(
            { targets: [] },
            {
              config: testConfig,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          assert.deepStrictEqual(
            selection.targets.map((target) => target.identity.toKey()),
            ["."],
          );
          assertTargetModules(selection, ".", [
            ModuleId.make("workspace-typescript-7"),
            ModuleId.make("workspace-monorepo-vite-plus"),
            ModuleId.make("workspace-quality-oxlint"),
            ModuleId.make("workspace-quality-oxfmt"),
            ModuleId.make("workspace-test-vitest"),
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should merge duplicate target specs when they resolve to the same target key",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const selection = yield* service.resolve(
            {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("server"),
                    name: "api",
                  }),
                  modules: [ModuleId.make("server-http-api")],
                },
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("server"),
                    name: "api",
                  }),
                  modules: [ModuleId.make("server-http-rpc")],
                },
              ],
            },
            {
              config: testConfig,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          assertTargetModules(selection, "server:apps/api", [
            ModuleId.make("server-http-api"),
            ModuleId.make("server-http-rpc"),
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should keep the first identity when recipe targets share a key",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const selection = yield* service.resolve(
            {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("server"),
                    name: "Api",
                  }),
                  modules: [ModuleId.make("server-http-api")],
                },
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("server"),
                    name: "api",
                  }),
                  modules: [ModuleId.make("server-http-rpc")],
                },
              ],
            },
            {
              config: testConfig,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          const server = selection.targets.find(
            (target) => target.identity.toKey() === "server:apps/api",
          );
          assert.strictEqual(server?.identity.name, "Api");
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should leave module validation for Blueprint resolution", () =>
      Effect.gen(function* () {
        const service = yield* RecipeResolver;
        const selection = yield* service.resolve(
          {
            targets: [
              {
                target: new TargetIdentity({
                  kind: TargetKind.make("server"),
                  name: "api",
                }),
                modules: [
                  ModuleId.make("server-not-real"),
                  ModuleId.make("package-db-postgres"),
                ],
              },
            ],
          },
          {
            config: testConfig,
            providerStrategy: { _tag: "fail-on-ambiguous" },
          },
        );

        assertTargetModules(selection, "server:apps/api", [
          ModuleId.make("server-not-real"),
          ModuleId.make("package-db-postgres"),
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should fail accurately for an unknown unnamed target kind", () =>
      Effect.gen(function* () {
        const service = yield* RecipeResolver;
        const error = yield* Effect.flip(
          service.resolve(
            {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("servre"),
                    name: "",
                  }),
                  modules: [ModuleId.make("server-http-api")],
                },
              ],
            },
            {
              config: testConfig,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          ),
        );

        assert.strictEqual(error._tag, "InvalidRecipeSpec");
        if (error._tag !== "InvalidRecipeSpec") {
          assert.fail("Expected InvalidRecipeSpec.");
        }
        assert.deepStrictEqual(
          error.issues.map(({ path }) => path),
          [["targets", "target", "kind"]],
        );
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should leave required-module dependencies for Blueprint resolution",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const selection = yield* service.resolve(
            {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("client-react"),
                    name: "web",
                  }),
                  modules: [ModuleId.make("client-react-http-api")],
                },
              ],
            },
            {
              config: testConfig,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          assertTargetModules(selection, "client-react:apps/web", [
            ModuleId.make("client-react-http-api"),
          ]);
          assert.strictEqual(
            modulesForTarget(selection.targets, "packages/domain"),
            undefined,
          );
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should not add same-kind required modules before Blueprint resolution",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const selection = yield* service.resolve(
            {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("cli"),
                    name: "custom",
                  }),
                  modules: [ModuleId.make("cli-command-chat-terminal")],
                },
              ],
            },
            {
              config: testConfig,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          assertTargetModules(selection, "cli:apps/custom", [
            ModuleId.make("cli-command-chat-terminal"),
          ]);
          assert.strictEqual(
            modulesForTarget(selection.targets, "apps/cli-app"),
            undefined,
          );
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should leave implied modules for Blueprint/catalog resolution",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const selection = yield* service.resolve(
            {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("client-react"),
                    name: "web",
                  }),
                  modules: [
                    ModuleId.make("client-react-http-api"),
                    ModuleId.make("server-needs-db"),
                  ],
                },
              ],
            },
            {
              config: testConfig,
              providerStrategy: { _tag: "first-provider" },
            },
          );

          assertTargetModules(selection, "client-react:apps/web", [
            ModuleId.make("client-react-http-api"),
            ModuleId.make("server-needs-db"),
          ]);
          assert.strictEqual(
            modulesForTarget(selection.targets, "server:apps/api"),
            undefined,
          );
          assert.strictEqual(
            modulesForTarget(selection.targets, "packages/db"),
            undefined,
          );
        }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("renderCreateCommand", () => {
    it.effect(
      "should keep explicitly selected workspace modules in a copied command",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const selection = yield* service.resolve(
            {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("workspace"),
                    name: "recipe-app",
                  }),
                  modules: [ModuleId.make("workspace-devenv-nix-flake")],
                },
              ],
            },
            {
              config: testConfig,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          const command = service.renderCreateCommand({
            config: testConfig,
            selection,
          });
          assert.match(
            command,
            / --target workspace\/recipe-app:workspace-devenv-nix-flake(?: |$)/,
          );
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should quote an apostrophe in a copied catalog argument", () =>
      Effect.gen(function* () {
        const service = yield* RecipeResolver;
        const config = Schema.decodeUnknownSync(StackConfig)({
          name: "recipe-app",
          runtime: { _tag: "bun" },
          test: "vitest",
          catalogs: [
            { name: "custom", url: "https://example.test/it's/catalog.json" },
          ],
        });
        const command = service.renderCreateCommand({
          config,
          selection: { targets: [] },
        });
        assert.match(command, / --test vitest(?: |$)/);
        assert.include(
          command,
          String.raw`--catalog 'custom=https://example.test/it'\''s/catalog.json'`,
        );
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should omit values supplied by an injected default StackConfig",
      () => {
        const injectedDefaults = new StackConfig({
          name: "injected-defaults",
          runtime: { _tag: "bun" },
          typescript: "6",
          monorepo: "turbo",
          lint: "biome",
          format: "biome",
          test: "vitest",
        });

        return Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const selection = yield* service.resolve(
            { targets: [] },
            {
              config: injectedDefaults,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          assert.strictEqual(
            service.renderCreateCommand({
              config: injectedDefaults,
              selection,
            }),
            "bunx stack-effect@latest create injected-defaults --no-git",
          );
        }).pipe(Effect.provide(makeTestLayer(injectedDefaults)));
      },
    );

    it.effect(
      "should render an explicit monorepo flag when Nx is configured",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const config = new StackConfig({
            ...testConfigFields,
            monorepo: "nx",
          });
          const selection = yield* service.resolve(
            { targets: [] },
            {
              config,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          assert.strictEqual(
            service.renderCreateCommand({ config, selection }),
            "bunx stack-effect@latest create recipe-app --monorepo nx --no-git",
          );
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should omit the monorepo flag when Vite+ is configured by default",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeResolver;
          const config = new StackConfig({
            ...testConfigFields,
            monorepo: "vite-plus",
          });
          const selection = yield* service.resolve(
            { targets: [] },
            {
              config,
              providerStrategy: { _tag: "fail-on-ambiguous" },
            },
          );

          assert.strictEqual(
            service.renderCreateCommand({ config, selection }),
            "bunx stack-effect@latest create recipe-app --no-git",
          );
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should render selected targets as create target flags", () =>
      Effect.gen(function* () {
        const service = yield* RecipeResolver;
        const selection = yield* service.resolve(
          {
            targets: [
              {
                target: new TargetIdentity({
                  kind: TargetKind.make("server"),
                  name: "api",
                }),
                modules: [ModuleId.make("server-http-api")],
              },
              {
                target: new TargetIdentity({
                  kind: TargetKind.make("workspace"),
                  name: "recipe-app",
                }),
                modules: [ModuleId.make("workspace-devenv-git")],
              },
            ],
          },
          {
            config: testConfig,
            providerStrategy: { _tag: "fail-on-ambiguous" },
          },
        );

        assert.strictEqual(
          service.renderCreateCommand({ config: testConfig, selection }),
          "bunx stack-effect@latest create recipe-app --target server/api:server-http-api",
        );
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should render non-default config flags and --no-git", () =>
      Effect.gen(function* () {
        const service = yield* RecipeResolver;
        const config = new StackConfig({
          name: "node app",
          runtime: { _tag: "node", packageManager: "pnpm" },
          monorepo: "turbo",
          lint: "eslint",
          format: "prettier",
          test: "vitest",
          typescript: "7",
        });
        const selection = yield* service.resolve(
          {
            targets: [
              {
                target: new TargetIdentity({
                  kind: TargetKind.make("client-react"),
                  name: "web",
                }),
                modules: [
                  ModuleId.make("client-react-vite"),
                  ModuleId.make("client-react-chat"),
                ],
              },
            ],
          },
          {
            config,
            providerStrategy: { _tag: "fail-on-ambiguous" },
          },
        );

        const [invocation, ...flags] = service
          .renderCreateCommand({ config, selection })
          .split(" --");

        assert.strictEqual(
          invocation,
          "npx stack-effect@latest create 'node app'",
        );
        assert.sameMembers(flags, [
          "target client-react/web:client-react-vite,client-react-chat",
          "runtime node",
          "package-manager pnpm",
          "monorepo turbo",
          "lint eslint",
          "format prettier",
          "no-git",
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should keep explicit Deno tooling in a copied command", () =>
      Effect.gen(function* () {
        const service = yield* RecipeResolver;
        const config = new StackConfig({
          ...testConfigFields,
          runtime: { _tag: "deno" },
          typescript: "7",
          monorepo: "vite-plus",
          lint: "oxlint",
          format: "oxfmt",
        });
        const selection = yield* service.resolve(
          { targets: [] },
          {
            config,
            providerStrategy: { _tag: "fail-on-ambiguous" },
          },
        );

        const [invocation, ...flags] = service
          .renderCreateCommand({ config, selection })
          .split(" --");

        assert.strictEqual(
          invocation,
          "deno run -A npm:stack-effect@latest create recipe-app",
        );
        assert.sameMembers(flags, [
          "runtime deno",
          "package-manager deno",
          "typescript 7",
          "monorepo vite-plus",
          "lint oxlint",
          "format oxfmt",
          "no-git",
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );
  });
});
