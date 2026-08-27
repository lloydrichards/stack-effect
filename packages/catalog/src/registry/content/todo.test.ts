import {
  Contribution,
  DddArchitecture,
  TargetIdentity,
  TargetKey,
  TargetKind,
  TargetPath,
} from "@repo/domain/Catalog";
import { ContributionTokenContext, StackConfig } from "@repo/domain/Scaffold";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { todoArchitectureModules } from "../modules/todo";
import * as content from "./todo";

const contains = (value: string, ...expected: ReadonlyArray<string>) =>
  expected.forEach((entry) => expect(value).toContain(entry));

const dddTodoTokenContext = (runtime: "bun" | "node") =>
  new ContributionTokenContext({
    targetKey: TargetKey.make("packages/todo/infrastructure"),
    identity: new TargetIdentity({
      kind: TargetKind.make("package"),
      name: "todo-infrastructure",
    }),
    architecture: DddArchitecture,
    layout: {
      path: TargetPath.make("packages/todo/infrastructure"),
      packageName: "@repo/todo-infrastructure",
    },
    config: new StackConfig({
      name: "todo" as typeof Schema.NonEmptyString.Type,
      runtime:
        runtime === "bun"
          ? { _tag: "bun" }
          : { _tag: "node", packageManager: "pnpm" },
    }),
  });

const infrastructureManifest = (runtime: "bun" | "node") =>
  JSON.parse(
    dddTodoTokenContext(runtime).resolve(
      content.dddTodoInfrastructurePackageJsonContents,
    ),
  ) as { readonly scripts: { readonly test: string } };

const dddTodoHostContents = (runtime: "bun" | "node") =>
  dddTodoTokenContext(runtime).resolve(content.dddTodoHostContents);

describe("DDD Todo generated contracts", () => {
  it("renders the runtime-specific HOST binding key", () => {
    const nodeHostContents = dddTodoHostContents("node");
    const bunHostContents = dddTodoHostContents("bun");
    const nodeHostLine =
      /^  host: Config\.string\("HOST"\)\.pipe\(Config\.withDefault\("0\.0\.0\.0"\)\),$/mu;
    const bunHostLine =
      /^  hostname: Config\.string\("HOST"\)\.pipe\(Config\.withDefault\("0\.0\.0\.0"\)\),$/mu;

    expect(nodeHostContents).toMatch(nodeHostLine);
    expect(nodeHostContents).not.toMatch(bunHostLine);
    expect(bunHostContents).toMatch(bunHostLine);
    expect(bunHostContents).not.toMatch(nodeHostLine);
  });

  it("keeps runtime, Memory, SQLite, and PostgreSQL composition boundaries explicit", () => {
    expect(infrastructureManifest("bun").scripts.test).toBe(
      "bunx --bun vitest run",
    );
    expect(infrastructureManifest("node").scripts.test).toBe("vitest run");
    contains(
      content.dddTodoSqliteContents,
      "SqliteClient.layerConfig",
      "SqliteMigrator.fromRecord",
      'Config.string("TODO_SQLITE_PATH")',
    );
    contains(
      content.dddTodoPostgresContents,
      "TodoPostgresConfig",
      "PgClient.layerConfig",
    );
    expect(content.dddTodoMemoryContents).not.toContain(
      "TodoRepositoryFailure",
    );
    expect(content.dddTodoMemoryContents).not.toContain("repositoryFailure");
  });

  it("maps minimal Shared Domain tooling and keeps the HTTP group/error in Domain", () => {
    contains(
      content.dddSharedDomainPackageJsonContents,
      '"name": "@repo/shared-domain"',
      '"test": "vitest run --passWithNoTests"',
    );
    contains(
      content.dddSharedDomainTsconfigContents,
      '"include": ["src", "test"]',
    );
    expect(content.dddSharedDomainIndexContents.trim()).toBe("export {};");
    contains(
      content.dddTodoDomainPackageJsonContents,
      '"./api": "./src/api.http.ts"',
      '"./http": "./src/todo.http.ts"',
    );
    contains(
      content.dddTodoDomainApiContents,
      'import { TodoHttpGroup } from "./todo.http.ts";',
      'export const Api = HttpApi.make("Api").add(TodoHttpGroup)',
    );
    contains(
      content.dddTodoDomainTsconfigContents,
      '"include": ["src", "test"]',
    );
    contains(content.dddTodoDomainContents, "TodoUnavailable");
    contains(content.dddTodoDomainHttpContents, "TodoHttpGroup");
    expect(content.dddTodoDomainHttpContents).not.toContain("HttpApi.make");
    expect(content.dddTodoDomainHttpContents).not.toContain("TodoHttpApi");
    expect(content.dddTodoDomainIndexContents.trim()).toBe(
      'export * from "./todo.ts";',
    );
  });

  it("uses scoped aliases and keeps Presentation group composition with a real Layer test", () => {
    for (const tsconfig of [
      content.dddTodoApplicationTsconfigContents,
      content.dddTodoInfrastructureTsconfigContents,
      content.dddTodoPresentationTsconfigContents,
    ])
      contains(tsconfig, '"include": ["src", "test"]');
    for (const test of [
      content.dddTodoDomainTestContents,
      content.dddTodoDomainHttpTestContents,
      content.dddTodoApplicationTestContents,
      content.dddTodoMemoryTestContents,
      content.dddTodoSqliteTestContents,
      content.dddTodoPresentationHttpTestContents,
    ])
      expect(test).toContain("../src/");
    for (const name of [
      "TodoId",
      "TodoTitle",
      "Todo",
      "CreateTodoInput",
      "UpdateTodoInput",
    ])
      contains(content.dddTodoDomainContents, `typeof ${name}.Type`);
    expect(content.dddTodoDomainContents).not.toContain("Schema.Schema.Type");
    contains(
      content.dddTodoHttpContents,
      'import { Api } from "@repo/todo-domain/api"',
      "export const TodoGroupLayer = HttpApiBuilder.group(",
      '"todos"',
      '.handle("create"',
      '.handle("list"',
      '.handle("get"',
      '.handle("update"',
      '.handle("delete"',
      'Effect.catchTag("TodoRepositoryFailure", unavailable)',
    );
    expect(content.dddTodoHttpContents).not.toMatch(
      /todoHandlers|HttpApi\.make|HttpApiBuilder\.layer\(|HttpApiScalar|TodoHttpLive|HttpRouter|platform/u,
    );
    contains(
      content.dddTodoPresentationHttpTestContents,
      'import { TodoGroupLayer } from "../src/http.ts"',
      "HttpRouter.provideRequest(RepositoryTest)",
      "Effect.scoped(Layer.build(TestLayer))",
      ").toEqual([TodoHttpGroup.key])",
    );
    expect(content.dddTodoPresentationHttpTestContents).not.toMatch(
      /TestApi|HttpApi\.make|HttpApiBuilder\.group|Layer\.provide\(RepositoryTest\)|toBeDefined|\sas\s(?:unknown|any|never)|platform/u,
    );
  });

  it("defines the exact four additive provider contribution sets", () => {
    const providers = new Map<string, ReadonlyArray<typeof Contribution.Type>>(
      todoArchitectureModules
        .filter((module) => module.id.includes("provider-"))
        .map(
          (
            module,
          ): readonly [string, ReadonlyArray<typeof Contribution.Type>] => [
            String(module.id),
            module.contributions,
          ],
        ),
    );
    const contributionsFor = (ids: ReadonlyArray<string>) =>
      ids.flatMap((id) => providers.get(id) ?? []);
    const cases = [
      { ids: [], files: [], keys: [] },
      {
        ids: ["server-http-api-todos-provider-sqlite"],
        files: [
          "packages/todo/infrastructure/.env.sqlite.example",
          "packages/todo/infrastructure/src/migrations/sqlite/0001_create_todos.ts",
          "packages/todo/infrastructure/src/sqlite.ts",
          "packages/todo/infrastructure/test/sqlite.test.ts",
          "data/.gitignore",
        ],
        keys: ["sqlite"],
      },
      {
        ids: ["server-http-api-todos-provider-postgres"],
        files: [
          "packages/todo/infrastructure/.env.postgres.example",
          "packages/todo/infrastructure/docker-compose.yml",
          "packages/todo/infrastructure/src/migrations/postgres/0001_create_todos.ts",
          "packages/todo/infrastructure/src/postgres.ts",
        ],
        keys: ["postgres"],
      },
      {
        ids: [
          "server-http-api-todos-provider-sqlite",
          "server-http-api-todos-provider-postgres",
        ],
        files: [
          "packages/todo/infrastructure/.env.postgres.example",
          "packages/todo/infrastructure/.env.sqlite.example",
          "packages/todo/infrastructure/docker-compose.yml",
          "packages/todo/infrastructure/src/migrations/postgres/0001_create_todos.ts",
          "packages/todo/infrastructure/src/migrations/sqlite/0001_create_todos.ts",
          "packages/todo/infrastructure/src/postgres.ts",
          "packages/todo/infrastructure/src/sqlite.ts",
          "packages/todo/infrastructure/test/sqlite.test.ts",
          "data/.gitignore",
        ],
        keys: ["sqlite", "postgres"],
      },
    ] as const;

    for (const expected of cases) {
      const expectedKeys = new Set<string>(expected.keys);
      const contributions = contributionsFor(expected.ids);
      expect(
        contributions
          .filter((contribution) => contribution._tag === "file")
          .map((contribution) => contribution.path)
          .sort(),
      ).toEqual([...expected.files].sort());
      expect(
        contributions
          .filter((contribution) => contribution._tag === "ts-object-field")
          .map((contribution) => contribution.field),
      ).toEqual(expected.keys);
      expect(
        contributions
          .filter((contribution) => contribution._tag === "pkg-json-entry")
          .map((contribution) => contribution.name)
          .sort(),
      ).toEqual(
        expected.keys
          .map((key) => `./${key}`)
          .sort()
          .concat(
            expectedKeys.has("sqlite")
              ? [
                  "{{#if runtime=node}}@effect/sql-sqlite-node{{/if}}{{#if runtime=bun}}@effect/sql-sqlite-bun{{/if}}",
                ]
              : [],
            expectedKeys.has("postgres") ? ["@effect/sql-pg"] : [],
          )
          .sort(),
      );
    }
    expect(
      JSON.parse(content.dddTodoInfrastructurePackageJsonContents),
    ).toMatchObject({
      exports: { "./memory": "./src/memory.ts" },
    });
    expect(content.dddTodoHostContents).toMatch(
      /repositoryProviders = defineRepositoryProviders\(\{\n  memory: TodoRepositoryMemory,\n\}\)/u,
    );
  });

  it("effectively wires generic host configuration, CORS, and strict providers", () => {
    const hostContents = content.dddTodoHostContents;
    expect(JSON.parse(content.dddTodoHostPackageJsonContents).name).toBe(
      "server-api",
    );
    contains(
      hostContents,
      "const ServerConfig = Config.all",
      "Config.withDefault(9000)",
      'Config.withDefault("0.0.0.0")',
      "Config.withDefault(120)",
      "http://localhost:3000,http://localhost:5173,http://localhost:4173",
      'config.allowedOrigins.split(",").map((origin) => origin.trim())',
      "HttpRouter.cors",
      "NodeHttpServer.layerConfig(createServer, ServerConfig)",
      "BunHttpServer.layerConfig(ServerConfig)",
      "TodoRepositoryMemory",
      'Api } from "@repo/todo-domain/api"',
      'TodoGroupLayer } from "@repo/todo-presentation/http"',
      "const ApiLayer = HttpApiBuilder.layer(Api)",
      "const ApiLive = ApiLayer.pipe(Layer.provide(TodoGroupLayer))",
      "const AllRouters = Layer.mergeAll(ApiLive, HttpApiScalar.layer(Api))",
      "Generated choices:",
    );
    expect(hostContents).toMatch(
      /const HttpLive = Effect\.gen\(function\* \(\) \{\n  const config = yield\* ServerConfig;\n  const provider = yield\* Config\.string\("TODO_REPOSITORY"\)/u,
    );
    expect(
      hostContents.indexOf(
        'const provider = yield* Config.string("TODO_REPOSITORY")',
      ),
    ).toBeLessThan(
      hostContents.indexOf(
        "NodeHttpServer.layerConfig(createServer, ServerConfig)",
      ),
    );
    expect(hostContents).not.toContain("const RepositoryLive = Layer.unwrap(");
    expect(content.dddTodoHostContents).not.toMatch(
      /TodoHttpGroup|todoHandlers|HttpApi\.make|Todo(?:Postgres|Sqlite)(?:Live|Config)|@repo\/todo-infrastructure\/(?:postgres|sqlite)|TodoHttpLive|@repo\/domain\/Api|HealthGroupLive|HelloGroupLive|ApiRouter|DatabaseLive|TodoRepositoryLive/u,
    );
    expect(
      JSON.parse(content.dddTodoHostPackageJsonContents).dependencies,
    ).toMatchObject({
      "@repo/todo-domain": "workspace:*",
    });
    expect(content.dddTodoHostPackageJsonContents).not.toMatch(
      /@effect\/sql-|todo-infrastructure\/(?:postgres|sqlite)/u,
    );
  });
});
