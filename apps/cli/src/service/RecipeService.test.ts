import { assert, describe, it } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import {
  ModuleCapability,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { RecipeSpec } from "@repo/domain/Recipe";
import { StackConfig } from "@repo/domain/Scaffold";
import { Effect, Layer, Schema } from "effect";
import {
  AmbiguousRecipeProvider,
  InvalidRecipeSpec,
  MissingRecipeProvider,
  RecipeProviderStrategy,
  RecipeResolveOptions,
  RecipeService,
  UnresolvedRecipeTarget,
} from "./RecipeService";

const TestLayer = RecipeService.layer.pipe(Layer.provide(CatalogService.layer));

const packageDbTarget = new TargetIdentity({
  kind: TargetKind.make("package"),
  name: "db",
});

const testConfig = new StackConfig({
  name: "recipe-app" as typeof Schema.NonEmptyString.Type,
  runtime: { _tag: "bun" },
  monorepo: "turbo",
  lint: "biome",
  format: "biome",
  test: "vitest",
});

const modulesForTarget = (
  targets: typeof import("@repo/domain/Selection").Selection.Type["targets"],
  targetKey: string,
) =>
  targets
    .find((target) => target.identity.toKey() === targetKey)
    ?.modules.map((module) => module.id);

const assertTargetModules = (
  selection: typeof import("@repo/domain/Selection").Selection.Type,
  targetKey: string,
  moduleIds: ReadonlyArray<typeof ModuleId.Type>,
) => {
  assert.deepStrictEqual(
    modulesForTarget(selection.targets, targetKey),
    moduleIds,
  );
};

describe("RecipeService", () => {
  describe("schemas", () => {
    it("should decode target specs when the command provides plain recipe input", () => {
      const spec = Schema.decodeUnknownSync(RecipeSpec)({
        targets: [
          {
            target: { kind: "server", name: "api" },
            modules: ["server-http-api"],
          },
          {
            target: { kind: "client-react", name: "web" },
            modules: ["client-react-vite"],
          },
        ],
      });

      assert.strictEqual(spec.targets[0]?.target.toKey(), "apps/server-api");
      assert.deepStrictEqual(spec.targets[0]?.modules, [
        ModuleId.make("server-http-api"),
      ]);
      assert.strictEqual(
        spec.targets[1]?.target.toKey(),
        "apps/client-react-web",
      );
    });

    it("should decode provider strategy variants when recipe resolution options are parsed", () => {
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(RecipeProviderStrategy)({
          _tag: "fail-on-ambiguous",
        }),
        { _tag: "fail-on-ambiguous" },
      );
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(RecipeProviderStrategy)({
          _tag: "first-provider",
        }),
        { _tag: "first-provider" },
      );

      const explicit = Schema.decodeUnknownSync(RecipeProviderStrategy)({
        _tag: "explicit",
        providers: [
          {
            target: { kind: "package", name: "db" },
            capability: "db-sql",
            moduleId: "package-db-postgres",
          },
        ],
      });

      if (explicit._tag !== "explicit") {
        assert.fail("Expected explicit provider strategy.");
      }

      assert.strictEqual(explicit.providers[0]?.target.toKey(), "packages/db");
      assert.strictEqual(
        explicit.providers[0]?.capability,
        ModuleCapability.make("db-sql"),
      );
    });

    it("should decode resolve options when config and provider strategy are provided", () => {
      const options = Schema.decodeUnknownSync(RecipeResolveOptions)({
        config: testConfig,
        providerStrategy: { _tag: "first-provider" },
      });

      assert.strictEqual(options.config.name, testConfig.name);
      assert.deepStrictEqual(options.providerStrategy, {
        _tag: "first-provider",
      });
    });
  });

  describe("resolve", () => {
    it.effect(
      "should return a Selection when recipe targets are requested",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeService;
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

          assertTargetModules(selection, "apps/server-api", [
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
          const service = yield* RecipeService;
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
            ModuleId.make("workspace-monorepo-turbo"),
            ModuleId.make("workspace-quality-biome"),
            ModuleId.make("workspace-test-vitest"),
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should add workspace target modules when the recipe explicitly targets the workspace",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeService;
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
            ModuleId.make("workspace-monorepo-turbo"),
            ModuleId.make("workspace-quality-biome"),
            ModuleId.make("workspace-test-vitest"),
            ModuleId.make("workspace-devenv-git"),
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should normalize workspace target names when explicit workspace modules are requested",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeService;
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
            ModuleId.make("workspace-monorepo-turbo"),
            ModuleId.make("workspace-quality-biome"),
            ModuleId.make("workspace-test-vitest"),
            ModuleId.make("workspace-devenv-git"),
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should dedupe workspace modules when StackConfig and recipe targets overlap",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeService;
          const selection = yield* service.resolve(
            {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("workspace"),
                    name: "recipe-app",
                  }),
                  modules: [
                    ModuleId.make("workspace-quality-biome"),
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
            ModuleId.make("workspace-monorepo-turbo"),
            ModuleId.make("workspace-quality-biome"),
            ModuleId.make("workspace-test-vitest"),
            ModuleId.make("workspace-devenv-git"),
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should resolve empty and punctuation-only app target names to catalog defaults",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeService;
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
                    name: ".",
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

    it.effect("should allow recipes to omit explicit workspace targets", () =>
      Effect.gen(function* () {
        const service = yield* RecipeService;
        const selection = yield* service.resolve(
          { targets: [] },
          {
            config: testConfig,
            providerStrategy: { _tag: "fail-on-ambiguous" },
          },
        );

        assertTargetModules(selection, ".", [
          ModuleId.make("workspace-monorepo-turbo"),
          ModuleId.make("workspace-quality-biome"),
          ModuleId.make("workspace-test-vitest"),
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should return a workspace-only Selection when the recipe has no targets",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeService;
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
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should merge duplicate target specs when they resolve to the same target key",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeService;
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

          assertTargetModules(selection, "apps/server-api", [
            ModuleId.make("server-http-api"),
            ModuleId.make("server-http-rpc"),
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should leave module validation for Blueprint resolution", () =>
      Effect.gen(function* () {
        const service = yield* RecipeService;
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

        assertTargetModules(selection, "apps/server-api", [
          ModuleId.make("server-not-real"),
          ModuleId.make("package-db-postgres"),
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should use catalog default names for unnamed targets", () =>
      Effect.gen(function* () {
        const service = yield* RecipeService;
        const selection = yield* service.resolve(
          {
            targets: [
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

        assertTargetModules(selection, "apps/server-api", [
          ModuleId.make("server-http-api"),
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should fail when an unnamed target kind has no catalog default name",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeService;
          const error = yield* Effect.flip(
            service.resolve(
              {
                targets: [
                  {
                    target: new TargetIdentity({
                      kind: TargetKind.make("package"),
                      name: "",
                    }),
                    modules: [ModuleId.make("package-db-postgres")],
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
          assert.include(error.issues[0]?.message, "does not define a default");
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should fail accurately for an unknown unnamed target kind", () =>
      Effect.gen(function* () {
        const service = yield* RecipeService;
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
        assert.include(error.issues[0]?.message, "Unknown target kind");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should leave required-module dependencies for Blueprint resolution",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeService;
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

          assertTargetModules(selection, "apps/client-react-web", [
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
          const service = yield* RecipeService;
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

          assertTargetModules(selection, "apps/cli-custom", [
            ModuleId.make("cli-command-chat-terminal"),
          ]);
          assert.strictEqual(
            modulesForTarget(selection.targets, "apps/cli-app"),
            undefined,
          );
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should leave implied modules and capability providers for Blueprint/catalog resolution",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeService;
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

          assertTargetModules(selection, "apps/client-react-web", [
            ModuleId.make("client-react-http-api"),
            ModuleId.make("server-needs-db"),
          ]);
          assert.strictEqual(
            modulesForTarget(selection.targets, "apps/server-api"),
            undefined,
          );
          assert.strictEqual(
            modulesForTarget(selection.targets, "packages/db"),
            undefined,
          );
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "should return only Selection data when recipe resolution succeeds",
      () =>
        Effect.gen(function* () {
          const service = yield* RecipeService;
          const selection = yield* service.resolve(
            {
              targets: [
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

          assert.containsAllKeys(selection, ["targets"]);
          assert.doesNotHaveAnyKeys(selection, [
            "spec",
            "providerStrategy",
            "resolvedTargets",
          ]);
        }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("renderCreateCommand", () => {
    it.effect("should render selected targets as create target flags", () =>
      Effect.gen(function* () {
        const service = yield* RecipeService;
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
          "stack-effect create recipe-app --target server/api:server-http-api",
        );
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should render non-default config flags and --no-git", () =>
      Effect.gen(function* () {
        const service = yield* RecipeService;
        const config = new StackConfig({
          name: "node app" as typeof Schema.NonEmptyString.Type,
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

        assert.strictEqual(
          service.renderCreateCommand({ config, selection }),
          "stack-effect create 'node app' --target client-react/web:client-react-vite,client-react-chat --runtime node --package-manager pnpm --typescript 7 --lint eslint --format prettier --no-git",
        );
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("errors", () => {
    it("should expose recoverable error tags when recipe resolution fails", () => {
      const invalid = new InvalidRecipeSpec({
        issues: [{ path: ["targets", 0], message: "Unknown target kind." }],
      });
      const missing = new MissingRecipeProvider({
        requestingModuleId: ModuleId.make("chat-persistence-db"),
        target: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "db",
        }),
        capability: ModuleCapability.make("db-sql"),
      });
      const ambiguous = new AmbiguousRecipeProvider({
        requestingModuleId: ModuleId.make("chat-persistence-db"),
        target: new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "db",
        }),
        capability: ModuleCapability.make("db-sql"),
        providers: [
          {
            moduleId: ModuleId.make("package-db-postgres"),
            title: "Postgres Database",
            description: "Reusable Effect SQL Postgres package with migrations",
          },
        ],
      });
      const unresolved = new UnresolvedRecipeTarget({
        requestingModuleId: ModuleId.make("chat-persistence-db"),
        targetKind: TargetKind.make("package"),
        reason: "ambiguous",
        candidates: [
          new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "db",
          }),
          new TargetIdentity({
            kind: TargetKind.make("package"),
            name: "storage",
          }),
        ],
      });

      assert.strictEqual(invalid._tag, "InvalidRecipeSpec");
      assert.strictEqual(missing._tag, "MissingRecipeProvider");
      assert.strictEqual(ambiguous._tag, "AmbiguousRecipeProvider");
      assert.strictEqual(unresolved._tag, "UnresolvedRecipeTarget");
    });
  });
});
