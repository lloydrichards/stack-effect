import { assert, describe, it } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import {
  ClassicArchitecture,
  DddArchitecture,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import { RecipeService, StackConfigDefaults } from "@repo/scaffold";
import { Effect, Layer, Option, Schema } from "effect";
import { buildWorkspaceSelection } from "./catalog";

const config = new StackConfig({
  name: "catalog-built" as typeof Schema.NonEmptyString.Type,
  runtime: { _tag: "bun" },
  typescript: "7",
  monorepo: "vite-plus",
  lint: "oxlint",
  format: "oxfmt",
  test: "vitest",
});

const TestLayer = RecipeService.layer.pipe(
  Layer.provideMerge(CatalogService.layer),
  Layer.provide(Layer.succeed(StackConfigDefaults, config)),
);

const dddOnlyModules = [
  "package-todo-domain",
  "package-todo-application",
  "package-todo-infrastructure",
  "package-todo-presentation-http",
];

describe("catalog workspace selection", () => {
  it.effect("selects only modules that resolve under Classic", () =>
    Effect.gen(function* () {
      const catalog = yield* CatalogService;
      const selection = yield* buildWorkspaceSelection(config, Option.none());
      const directlySelected = selection.targets.flatMap((target) =>
        target.modules.map((module) => module.id),
      );

      assert.include(directlySelected, ModuleId.make("domain-api-contracts"));
      for (const moduleId of dddOnlyModules) {
        assert.notInclude(directlySelected, ModuleId.make(moduleId));
      }
      for (const moduleId of directlySelected) {
        assert.isDefined(
          yield* catalog.resolveModule(moduleId, ClassicArchitecture),
          `${moduleId} must resolve under Classic`,
        );
      }
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("selects the exact DDD Todo authoring graph", () =>
    Effect.gen(function* () {
      const selection = yield* buildWorkspaceSelection(
        config,
        Option.some([
          {
            target: new TargetIdentity({
              kind: TargetKind.make("server"),
              name: "api",
            }),
            modules: [ModuleId.make("server-http-api-todos")],
          },
        ]),
        Option.some(DddArchitecture),
      );
      const server = selection.targets.find(
        (target) =>
          target.identity.kind === "server" && target.identity.name === "api",
      );
      assert.deepStrictEqual(
        [server?.architecture, server?.modules.map((module) => module.id)],
        [DddArchitecture, [ModuleId.make("server-http-api-todos")]],
      );
      const workspaceTargets = selection.targets.filter(
        (target) => target.identity.kind === "workspace",
      );
      assert.lengthOf(workspaceTargets, 1);
      assert.deepStrictEqual(
        [
          [
            workspaceTargets[0]?.identity.kind,
            workspaceTargets[0]?.identity.name,
          ],
          workspaceTargets[0]?.architecture,
          workspaceTargets[0]?.modules.map((module) => module.id),
        ],
        [
          ["workspace", "catalog-built"],
          undefined,
          [
            "workspace-typescript-7",
            "workspace-monorepo-vite-plus",
            "workspace-quality-oxlint",
            "workspace-quality-oxfmt",
            "workspace-test-vitest",
          ].map((moduleId) => ModuleId.make(moduleId)),
        ],
      );
      assert.deepStrictEqual(server?.identity.toKey(), "apps/server-api");
      assert.isFalse(
        selection.targets.some(
          (target) =>
            target.identity.kind === "server" &&
            target.identity.name === "todo",
        ),
      );
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "keeps the DDD catalog review generation provenance on single physical paths",
    () =>
      Effect.gen(function* () {
        const catalog = yield* CatalogService;
        const sharedDomain = yield* catalog.resolveModule(
          ModuleId.make("package-shared-domain"),
          DddArchitecture,
        );
        const dddServer = yield* catalog.resolveModule(
          ModuleId.make("server-http-api"),
          DddArchitecture,
        );
        const todoDomain = yield* catalog.resolveModule(
          ModuleId.make("package-todo-domain"),
          DddArchitecture,
        );
        const todoApplication = yield* catalog.resolveModule(
          ModuleId.make("package-todo-application"),
          DddArchitecture,
        );
        const todoInfrastructure = yield* catalog.resolveModule(
          ModuleId.make("package-todo-infrastructure"),
          DddArchitecture,
        );
        const todoPresentation = yield* catalog.resolveModule(
          ModuleId.make("package-todo-presentation-http"),
          DddArchitecture,
        );
        const sqliteProvider = yield* catalog.resolveModule(
          ModuleId.make("server-http-api-todos-provider-sqlite"),
          DddArchitecture,
        );
        const postgresProvider = yield* catalog.resolveModule(
          ModuleId.make("server-http-api-todos-provider-postgres"),
          DddArchitecture,
        );
        const filePaths = (
          definition: typeof sharedDomain | undefined,
        ): ReadonlyArray<string> =>
          definition?.contributions.flatMap((contribution) =>
            contribution._tag === "file" ? [contribution.path] : [],
          ) ?? [];
        const sharedTarget = new TargetIdentity({
          kind: TargetKind.make("package"),
          name: "shared-domain",
        });

        assert.deepStrictEqual(
          [
            [
              sharedDomain?.id,
              sharedDomain?.supportedOn.map((supportedOn) =>
                supportedOn._tag === "identity"
                  ? supportedOn.identity.toKey()
                  : supportedOn.kind,
              ),
              sharedDomain?.architecture?.context,
              filePaths(sharedDomain),
            ],
            [todoDomain?.id, filePaths(todoDomain)],
            [todoApplication?.id, filePaths(todoApplication)],
            [todoInfrastructure?.id, filePaths(todoInfrastructure)],
            [todoPresentation?.id, filePaths(todoPresentation)],
          ],
          [
            [
              ModuleId.make("package-shared-domain"),
              [sharedTarget.toKey()],
              { id: "shared", role: "domain" },
              [
                "{{targetPath}}/package.json",
                "{{targetPath}}/tsconfig.json",
                "{{targetPath}}/src/index.ts",
              ],
            ],
            [
              ModuleId.make("package-todo-domain"),
              [
                "{{targetPath}}/package.json",
                "{{targetPath}}/tsconfig.json",
                "{{targetPath}}/src/todo.ts",
                "{{targetPath}}/test/todo.test.ts",
                "{{targetPath}}/src/api.http.ts",
                "{{targetPath}}/src/todo.http.ts",
                "{{targetPath}}/test/http.test.ts",
                "{{targetPath}}/src/index.ts",
              ],
            ],
            [
              ModuleId.make("package-todo-application"),
              [
                "{{targetPath}}/package.json",
                "{{targetPath}}/tsconfig.json",
                "{{targetPath}}/src/ports/todo-repository.ts",
                "{{targetPath}}/src/use-cases/create-todo.ts",
                "{{targetPath}}/src/use-cases/list-todos.ts",
                "{{targetPath}}/src/use-cases/get-todo.ts",
                "{{targetPath}}/src/use-cases/update-todo.ts",
                "{{targetPath}}/src/use-cases/delete-todo.ts",
                "{{targetPath}}/test/use-cases.test.ts",
                "{{targetPath}}/src/index.ts",
              ],
            ],
            [
              ModuleId.make("package-todo-infrastructure"),
              [
                "{{targetPath}}/package.json",
                "{{targetPath}}/tsconfig.json",
                "{{targetPath}}/src/memory.ts",
                "{{targetPath}}/test/memory.test.ts",
              ],
            ],
            [
              ModuleId.make("package-todo-presentation-http"),
              [
                "{{targetPath}}/package.json",
                "{{targetPath}}/tsconfig.json",
                "{{targetPath}}/src/http.ts",
                "{{targetPath}}/test/http.test.ts",
              ],
            ],
          ],
        );
        for (const [provider, paths] of [
          [
            sqliteProvider,
            [
              "packages/todo/infrastructure/src/sqlite.ts",
              "packages/todo/infrastructure/src/migrations/sqlite/0001_create_todos.ts",
              "packages/todo/infrastructure/test/sqlite.test.ts",
              "packages/todo/infrastructure/.env.sqlite.example",
              "data/.gitignore",
            ],
          ],
          [
            postgresProvider,
            [
              "packages/todo/infrastructure/src/postgres.ts",
              "packages/todo/infrastructure/src/migrations/postgres/0001_create_todos.ts",
              "packages/todo/infrastructure/.env.postgres.example",
              "packages/todo/infrastructure/docker-compose.yml",
            ],
          ],
        ] as const) {
          assert.deepStrictEqual(
            provider?.supportedOn.map((supportedOn) =>
              supportedOn._tag === "identity"
                ? `${supportedOn.identity.kind}/${supportedOn.identity.name}`
                : supportedOn.kind,
            ),
            ["server/api"],
          );
          assert.deepStrictEqual(filePaths(provider), paths);
        }

        assert.deepStrictEqual(dddServer?.dependencies, [
          {
            _tag: "required-module",
            target: sharedTarget,
            moduleId: ModuleId.make("package-shared-domain"),
            architecture: DddArchitecture,
          },
        ]);

        const selection = yield* buildWorkspaceSelection(
          config,
          Option.some([
            {
              target: new TargetIdentity({
                kind: TargetKind.make("server"),
                name: "api",
              }),
              modules: [
                ModuleId.make("server-http-api-todos"),
                ModuleId.make("server-http-api-todos-provider-sqlite"),
                ModuleId.make("server-http-api-todos-provider-postgres"),
              ],
            },
            {
              target: new TargetIdentity({
                kind: TargetKind.make("client-react"),
                name: "web",
              }),
              modules: [ModuleId.make("client-react-http-api-todos")],
            },
          ]),
          Option.some(DddArchitecture),
        );
        assert.deepStrictEqual(
          selection.targets
            .filter((target) => target.identity.kind !== "workspace")
            .map((target) => [
              target.identity.toKey(),
              target.architecture,
              target.modules.map((module) => module.id).sort(),
            ])
            .sort(([a], [b]) => String(a).localeCompare(String(b))),
          [
            [
              new TargetIdentity({
                kind: TargetKind.make("client-react"),
                name: "web",
              }).toKey(),
              DddArchitecture,
              [ModuleId.make("client-react-http-api-todos")],
            ],
            [
              new TargetIdentity({
                kind: TargetKind.make("server"),
                name: "api",
              }).toKey(),
              DddArchitecture,
              [
                ModuleId.make("server-http-api-todos"),
                ModuleId.make("server-http-api-todos-provider-postgres"),
                ModuleId.make("server-http-api-todos-provider-sqlite"),
              ],
            ],
          ],
        );
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("rejects architecture without an explicit target", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        buildWorkspaceSelection(
          config,
          Option.none(),
          Option.some(DddArchitecture),
        ),
      );
      assert.isTrue(result._tag === "Failure");
    }).pipe(Effect.provide(TestLayer)),
  );
});
