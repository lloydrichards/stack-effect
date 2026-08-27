import {
  ClassicArchitecture,
  ContextId,
  DddArchitecture,
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import * as todo from "../content/todo";

const target = (kind: "package" | "server", name: string) =>
  new TargetIdentity({ kind: TargetKind.make(kind), name });
const packageTarget = (name: string) => target("package", name);
const onPackage = (name: string) => [
  { _tag: "identity" as const, identity: packageTarget(name) },
];
const serverApiTarget = target("server", "api");
const required = (name: string, moduleId: string) => ({
  _tag: "required-module" as const,
  target: packageTarget(name),
  moduleId: ModuleId.make(moduleId),
  architecture: DddArchitecture,
});
const todoHostDependency = {
  _tag: "required-module" as const,
  target: serverApiTarget,
  moduleId: ModuleId.make("server-http-api-todos"),
  architecture: DddArchitecture,
};
const file = (path: string, contents: string) => ({
  _tag: "file" as const,
  path: `{{targetPath}}/${path}`,
  contents,
});
const directFile = (path: string, contents: string) => ({
  _tag: "file" as const,
  path,
  contents,
});
const directFiles = (files: Readonly<Record<string, string>>) =>
  Object.entries(files).map(([path, contents]) => directFile(path, contents));
const context = (
  role: "domain" | "application" | "infrastructure" | "presentation",
) => ({ id: ContextId.make("todo"), role });
const dddContext = (
  role: "domain" | "application" | "infrastructure" | "presentation",
) => ({ default: DddArchitecture, context: context(role), variants: [] });
const infraEntry = (
  field: "exports" | "dependencies",
  name: string,
  value: string,
) => ({
  _tag: "pkg-json-entry" as const,
  path: "packages/todo/infrastructure/package.json",
  field,
  name,
  value,
});
const todoProvider = (field: "sqlite" | "postgres", value: string) => ({
  _tag: "ts-object-field" as const,
  path: "{{targetPath}}/src/index.ts",
  targetVariable: "repositoryProviders",
  functionName: "defineRepositoryProviders",
  field,
  value,
  import: {
    moduleSpecifier: `@repo/todo-infrastructure/${field}`,
    namedImports: [value],
  },
});

export const todoArchitectureModules = [
  {
    id: ModuleId.make("workspace-context-packages"),
    title: "Nested context packages",
    description: "Internal nested workspace discovery support",
    visibility: "internal",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [],
    contributions: [
      {
        _tag: "json-array-entry",
        path: "package.json",
        field: "workspaces",
        value: "packages/*/*",
      },
      {
        _tag: "yaml-sequence-entry",
        path: "pnpm-workspace.yaml",
        key: "packages",
        value: "packages/*/*",
      },
    ],
    architecture: { default: ClassicArchitecture, variants: [] },
  },
  {
    id: ModuleId.make("package-todo-domain"),
    title: "Todo domain",
    description: "Internal Todo domain package",
    visibility: "internal",
    supportedOn: [{ _tag: "identity", identity: packageTarget("todo-domain") }],
    dependencies: [],
    contributions: [
      file("package.json", todo.dddTodoDomainPackageJsonContents),
      file("tsconfig.json", todo.dddTodoDomainTsconfigContents),
      file("src/todo.ts", todo.dddTodoDomainContents),
      file("test/todo.test.ts", todo.dddTodoDomainTestContents),
      file("src/api.http.ts", todo.dddTodoDomainApiContents),
      file("src/todo.http.ts", todo.dddTodoDomainHttpContents),
      file("test/http.test.ts", todo.dddTodoDomainHttpTestContents),
      file("src/index.ts", todo.dddTodoDomainIndexContents),
    ],
    architecture: dddContext("domain"),
  },
  {
    id: ModuleId.make("package-todo-application"),
    title: "Todo application",
    description: "Internal Todo application package",
    visibility: "internal",
    supportedOn: onPackage("todo-application"),
    dependencies: [required("todo-domain", "package-todo-domain")],
    contributions: [
      file("package.json", todo.dddTodoApplicationPackageJsonContents),
      file("tsconfig.json", todo.dddTodoApplicationTsconfigContents),
      file("src/ports/todo-repository.ts", todo.dddTodoApplicationContents),
      file("src/use-cases/create-todo.ts", todo.dddTodoCreateContents),
      file("src/use-cases/list-todos.ts", todo.dddTodoListContents),
      file("src/use-cases/get-todo.ts", todo.dddTodoGetContents),
      file("src/use-cases/update-todo.ts", todo.dddTodoUpdateContents),
      file("src/use-cases/delete-todo.ts", todo.dddTodoDeleteContents),
      file("test/use-cases.test.ts", todo.dddTodoApplicationTestContents),
      file("src/index.ts", todo.dddTodoApplicationIndexContents),
    ],
    architecture: dddContext("application"),
  },
  {
    id: ModuleId.make("package-todo-infrastructure"),
    title: "Todo infrastructure",
    description: "Internal Todo infrastructure package",
    visibility: "internal",
    supportedOn: onPackage("todo-infrastructure"),
    dependencies: [
      required("todo-application", "package-todo-application"),
      required("todo-domain", "package-todo-domain"),
    ],
    contributions: [
      file("package.json", todo.dddTodoInfrastructurePackageJsonContents),
      file("tsconfig.json", todo.dddTodoInfrastructureTsconfigContents),
      file("src/memory.ts", todo.dddTodoMemoryContents),
      file("test/memory.test.ts", todo.dddTodoMemoryTestContents),
    ],
    architecture: dddContext("infrastructure"),
  },
  {
    id: ModuleId.make("server-http-api-todos-provider-sqlite"),
    title: "SQLite Todo provider",
    description: "Additive SQLite persistence for the DDD Todo HTTP API",
    supportedOn: [{ _tag: "identity", identity: serverApiTarget }],
    dependencies: [todoHostDependency],
    contributions: [
      ...directFiles({
        "packages/todo/infrastructure/src/sqlite.ts":
          todo.dddTodoSqliteContents,
        "packages/todo/infrastructure/src/migrations/sqlite/0001_create_todos.ts":
          todo.dddTodoSqliteMigrationContents,
        "packages/todo/infrastructure/test/sqlite.test.ts":
          todo.dddTodoSqliteTestContents,
        "packages/todo/infrastructure/.env.sqlite.example":
          todo.dddTodoSqliteEnvContents,
        "data/.gitignore": todo.dddTodoSqliteIgnoreContents,
      }),
      infraEntry("exports", "./sqlite", "./src/sqlite.ts"),
      infraEntry(
        "dependencies",
        "{{#if runtime=node}}@effect/sql-sqlite-node{{/if}}{{#if runtime=bun}}@effect/sql-sqlite-bun{{/if}}",
        "^4.0.0-rc.108",
      ),
      todoProvider("sqlite", "TodoSqliteLive"),
    ],
    architecture: { default: DddArchitecture, variants: [] },
  },
  {
    id: ModuleId.make("server-http-api-todos-provider-postgres"),
    title: "PostgreSQL Todo provider",
    description: "Additive PostgreSQL persistence for the DDD Todo HTTP API",
    supportedOn: [{ _tag: "identity", identity: serverApiTarget }],
    dependencies: [todoHostDependency],
    contributions: [
      ...directFiles({
        "packages/todo/infrastructure/src/postgres.ts":
          todo.dddTodoPostgresContents,
        "packages/todo/infrastructure/src/migrations/postgres/0001_create_todos.ts":
          todo.dddTodoMigrationContents,
        "packages/todo/infrastructure/.env.postgres.example":
          todo.dddTodoEnvContents,
        "packages/todo/infrastructure/docker-compose.yml":
          todo.dddTodoComposeContents,
      }),
      infraEntry("exports", "./postgres", "./src/postgres.ts"),
      infraEntry("dependencies", "@effect/sql-pg", "^4.0.0-rc.108"),
      todoProvider("postgres", "TodoPostgresLive"),
    ],
    architecture: { default: DddArchitecture, variants: [] },
  },
  {
    id: ModuleId.make("package-todo-presentation-http"),
    title: "Todo HTTP presentation",
    description: "Internal Todo HTTP presentation package",
    visibility: "internal",
    supportedOn: onPackage("todo-presentation"),
    dependencies: [
      required("todo-application", "package-todo-application"),
      required("todo-domain", "package-todo-domain"),
    ],
    contributions: [
      file("package.json", todo.dddTodoPresentationPackageJsonContents),
      file("tsconfig.json", todo.dddTodoPresentationTsconfigContents),
      file("src/http.ts", todo.dddTodoHttpContents),
      file("test/http.test.ts", todo.dddTodoPresentationHttpTestContents),
    ],
    architecture: dddContext("presentation"),
  },
] satisfies ReadonlyArray<typeof ModuleDefinition.Type>;
