import { assert, describe, it } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import { catalogTestModuleRegistry } from "@repo/catalog/test-support";
import {
  DddArchitecture,
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import { Cause, Effect, Exit, Layer, Schema } from "effect";
import { BlueprintService } from "../blueprint/BlueprintService";
import { RecipeService } from "./RecipeService";
import { StackConfigDefaults } from "./StackConfigDefaults";

const clientKind = TargetKind.make("client-react");
const serverKind = TargetKind.make("server");
const sourceId = ModuleId.make("fixture-client-implies-exact-server");
const impliedId = ModuleId.make("fixture-server-exact-capability");
const exactServer = new TargetIdentity({
  kind: serverKind,
  name: "fixture-api",
});
const wrongServer = new TargetIdentity({ kind: serverKind, name: "wrong-api" });
const reason = "Synthetic client requires its exact fixture API.";

const fixtures: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: sourceId,
    title: "Synthetic exact implication source",
    description: "Test-only generic exact implication source",
    supportedOn: [{ _tag: "kind", kind: clientKind }],
    dependencies: [],
    contributions: [],
    implies: [
      {
        targetKind: serverKind,
        target: exactServer,
        moduleId: impliedId,
        reason,
      },
    ],
    architecture: { default: DddArchitecture, variants: [] },
  },
  {
    id: impliedId,
    title: "Synthetic exact implication target",
    description: "Test-only generic exact implication target",
    supportedOn: [{ _tag: "identity", identity: exactServer }],
    dependencies: [],
    contributions: [],
    architecture: { default: DddArchitecture, variants: [] },
  },
];

const config = new StackConfig({
  name: "fixture-workspace" as typeof Schema.NonEmptyString.Type,
  runtime: { _tag: "bun" },
  typescript: "7",
  monorepo: "vite-plus",
  lint: "oxlint",
  format: "oxfmt",
  test: "vitest",
});

const withFixtures = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      catalogTestModuleRegistry.push(...fixtures);
    }),
    () => effect,
    () =>
      Effect.sync(() => {
        catalogTestModuleRegistry.splice(-fixtures.length);
      }),
  );

const makeLayer = () => {
  const catalog = CatalogService.layer;
  return Layer.mergeAll(
    RecipeService.layer.pipe(
      Layer.provide(catalog),
      Layer.provide(Layer.succeed(StackConfigDefaults, config)),
    ),
    Layer.effect(BlueprintService)(BlueprintService.make).pipe(
      Layer.provide(catalog),
    ),
    catalog,
  );
};

const recipe = (
  targets: ReadonlyArray<{
    target: TargetIdentity;
    modules: ReadonlyArray<typeof ModuleId.Type>;
    architecture?: typeof DddArchitecture;
  }>,
) => ({ targets });

const resolve = (targets: Parameters<typeof recipe>[0]) =>
  Effect.gen(function* () {
    const recipes = yield* RecipeService;
    return yield* recipes.resolve(recipe(targets), {
      config,
      providerStrategy: { _tag: "fail-on-ambiguous" },
    });
  });

describe.sequential("generic exact named implications", () => {
  it.effect(
    "honors targetName, inherits architecture, dedupes, preserves order, and is idempotent",
    () =>
      withFixtures(
        Effect.gen(function* () {
          const client = new TargetIdentity({ kind: clientKind, name: "web" });
          const selection = yield* resolve([
            {
              target: client,
              modules: [sourceId, sourceId],
              architecture: DddArchitecture,
            },
            {
              target: exactServer,
              modules: [impliedId],
              architecture: DddArchitecture,
            },
          ]);
          assert.deepStrictEqual(
            selection.targets
              .filter((target) => target.identity.kind !== "workspace")
              .map((target) => ({
                key: String(target.identity.toKey()),
                ...(target.architecture === undefined
                  ? {}
                  : { architecture: target.architecture }),
                modules: target.modules.map(({ id }) => id),
              })),
            [
              {
                key: client.toKey(),
                architecture: DddArchitecture,
                modules: [sourceId],
              },
              {
                key: exactServer.toKey(),
                architecture: DddArchitecture,
                modules: [impliedId],
              },
            ],
          );
          const repeated = yield* resolve(
            selection.targets.map((target) => ({
              target: target.identity,
              modules: target.modules.map(({ id }) => id),
              ...(target.architecture === undefined
                ? {}
                : { architecture: target.architecture }),
            })),
          );
          assert.deepStrictEqual(repeated, selection);
        }).pipe(Effect.provide(makeLayer())),
      ),
  );

  it.effect(
    "projects provenance descriptors and rejects an unsupported exact target with a typed Blueprint failure",
    () =>
      withFixtures(
        Effect.gen(function* () {
          const catalog = yield* CatalogService;
          const projected = yield* catalog.toBuilderCatalog({
            owners: [new TargetIdentity({ kind: clientKind, name: "web" })],
            architecture: DddArchitecture,
          });
          const descriptor = projected.targetModules
            .flatMap(({ modules }) => modules)
            .find(({ id }) => id === sourceId)?.implies[0];
          assert.deepStrictEqual(descriptor, {
            targetKind: serverKind,
            target: exactServer,
            moduleId: impliedId,
            reason,
          });
          const wrongProjection = yield* catalog.toBuilderCatalog({
            owners: [wrongServer],
            architecture: DddArchitecture,
          });
          assert.deepStrictEqual(
            wrongProjection.targetModules
              .flatMap(({ modules }) => modules)
              .find(({ id }) => id === impliedId)?.availability,
            {
              enabled: false,
              code: "unsupported-owner",
              reason: `This module is not supported on ${wrongServer.toKey()} for ddd.`,
              action: "Choose a compatible target identity.",
            },
          );

          const blueprints = yield* BlueprintService;
          const exit = yield* Effect.exit(
            blueprints.resolve({
              targets: [
                {
                  identity: wrongServer,
                  architecture: DddArchitecture,
                  modules: [{ id: impliedId }],
                },
              ],
            }),
          );
          assert(Exit.isFailure(exit));
          assert.match(
            String(Cause.squash(exit.cause)),
            /BlueprintFailure|Unsupported target-module combination/,
          );
        }).pipe(Effect.provide(makeLayer())),
      ),
  );
  it.effect(
    "normalizes direct, implied, and provider DDD Todo selections on server/api",
    () =>
      Effect.gen(function* () {
        const client = new TargetIdentity({ kind: clientKind, name: "web" });
        const server = new TargetIdentity({ kind: serverKind, name: "api" });
        const direct = yield* resolve([
          {
            target: server,
            modules: [ModuleId.make("server-http-api-todos")],
            architecture: DddArchitecture,
          },
        ]);
        const implied = yield* resolve([
          {
            target: client,
            modules: [ModuleId.make("client-react-http-api-todos")],
            architecture: DddArchitecture,
          },
        ]);
        const bothProviders = yield* resolve([
          {
            target: client,
            modules: [ModuleId.make("client-react-http-api-todos")],
            architecture: DddArchitecture,
          },
          {
            target: server,
            modules: [
              ModuleId.make("server-http-api-todos"),
              ModuleId.make("server-http-api-todos-provider-sqlite"),
              ModuleId.make("server-http-api-todos-provider-postgres"),
            ],
            architecture: DddArchitecture,
          },
        ]);

        const normalizeDddTargets = (selection: typeof direct) =>
          selection.targets
            .filter(({ identity }) => identity.kind !== "workspace")
            .map(({ identity, architecture, modules }) => ({
              identity: String(identity.toKey()),
              architecture: String(architecture),
              modules: modules.map(({ id }) => String(id)),
            }));

        assert.deepStrictEqual(normalizeDddTargets(direct), [
          {
            identity: "apps/server-api",
            architecture: "ddd",
            modules: ["server-http-api-todos"],
          },
        ]);
        assert.deepStrictEqual(normalizeDddTargets(implied), [
          {
            identity: "apps/client-react-web",
            architecture: "ddd",
            modules: ["client-react-http-api-todos"],
          },
          {
            identity: "apps/server-api",
            architecture: "ddd",
            modules: ["server-http-api-todos"],
          },
        ]);
        assert.deepStrictEqual(normalizeDddTargets(bothProviders), [
          {
            identity: "apps/client-react-web",
            architecture: "ddd",
            modules: ["client-react-http-api-todos"],
          },
          {
            identity: "apps/server-api",
            architecture: "ddd",
            modules: [
              "server-http-api-todos",
              "server-http-api-todos-provider-sqlite",
              "server-http-api-todos-provider-postgres",
            ],
          },
        ]);
        assert.isFalse(
          bothProviders.targets.some(
            ({ identity }) => identity.toKey() === "apps/server-todo-api",
          ),
        );
      }).pipe(Effect.provide(makeLayer())),
  );
});
