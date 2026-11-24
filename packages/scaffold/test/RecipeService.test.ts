import { assert, describe, layer } from "@effect/vitest";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import type {
  RecipeProviderStrategy,
  RecipeTargetSpec,
} from "@repo/domain/Recipe";
import { StackConfig } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import { BlueprintService } from "@repo/scaffold/BlueprintService";
import { RecipeService } from "@repo/scaffold/RecipeService";
import { Effect, Layer, Schema } from "effect";
import { ProviderCatalogLayer } from "./fixtures/scaffold";

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
    const recipes = yield* RecipeService;
    return yield* recipes.resolve({ targets }, { config, providerStrategy });
  });

const modulesOn = (selection: Selection, targetKey: string) =>
  selection.targets
    .find((target) => target.identity.toKey() === targetKey)
    ?.modules.map((module) => module.id);

const TestLayer = Layer.merge(RecipeService.layer, BlueprintService.layer).pipe(
  Layer.provide(ProviderCatalogLayer),
);

describe("RecipeService", () => {
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

          const blueprints = yield* BlueprintService;
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
  });
});
