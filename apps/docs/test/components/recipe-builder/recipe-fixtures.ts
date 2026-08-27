import { Schema } from "effect";
import type {
  RecipeBuilderFormValues,
  TargetInstance,
} from "../../../app/components/recipe-builder/form";
import {
  CatalogModule,
  RecipeBuilderCatalog,
} from "../../../app/workers/recipe-builder/domain";

const makeCatalogModule = Schema.decodeUnknownSync(CatalogModule);

const configTypescriptViteModuleFixture = makeCatalogModule({
  id: "config-typescript-vite",
  title: "Config TypeScript Vite",
  description: "Vite TypeScript preset for client applications",
  visibility: "internal",
  dependencies: [],
  implies: [],
  children: [],
});

const domainApiModuleFixture = makeCatalogModule({
  id: "domain-api-contracts",
  title: "Domain API",
  description: "Shared domain schemas and HTTP API definitions",
  visibility: "internal",
  dependencies: [],
  implies: [],
  children: [],
});

const serverHttpModuleFixture = makeCatalogModule({
  id: "server-http-api",
  title: "HTTP API Server",
  description: "REST API endpoints with Effect HTTP",
  visibility: "public",
  dependencies: [
    {
      _tag: "required-module",
      target: { kind: "package", name: "domain" },
      moduleId: "domain-api-contracts",
    },
  ],
  implies: [],
  children: [],
});

export const clientModuleFixture = makeCatalogModule({
  id: "client-react-http-api",
  title: "HTTP API Client",
  description: "REST API client with Effect Atom and typed HttpApiClient",
  visibility: "public",
  dependencies: [
    {
      _tag: "required-module",
      target: { kind: "package", name: "domain" },
      moduleId: "domain-api-contracts",
    },
  ],
  implies: [{ targetKind: "server", moduleId: "server-http-api" }],
  children: [],
});

const todoRepositoryModuleFixture = makeCatalogModule({
  id: "package-db-todo-repository",
  title: "Todo Repository",
  description: "Persistent Todo CRUD repository over the selected SQL database",
  visibility: "internal",
  dependencies: [
    {
      _tag: "required-capability",
      target: { kind: "package", name: "db" },
      capability: "db-sql",
    },
  ],
  implies: [],
  children: [],
});

const sqliteModuleFixture = makeCatalogModule({
  id: "package-db-sqlite",
  title: "SQLite Database",
  description: "Reusable Effect SQL SQLite package with migrations",
  visibility: "public",
  dependencies: [],
  implies: [],
  children: [],
});

const postgresModuleFixture = makeCatalogModule({
  id: "package-db-postgres",
  title: "Postgres Database",
  description: "Reusable Effect SQL Postgres package with migrations",
  visibility: "public",
  dependencies: [],
  implies: [],
  children: [],
});

const serverTodoModuleFixture = makeCatalogModule({
  id: "server-http-api-todos",
  title: "Todo HTTP API",
  description: "Persistent Todo CRUD endpoints over Effect HTTP API",
  visibility: "internal",
  dependencies: [
    {
      _tag: "required-module",
      target: { kind: "package", name: "db" },
      moduleId: todoRepositoryModuleFixture.id,
    },
  ],
  implies: [],
  children: [],
});

const clientTodoModuleFixture = makeCatalogModule({
  id: "client-react-http-api-todos",
  title: "Todo HTTP Client",
  description: "Persistent Todo CRUD card backed by the typed HTTP API",
  visibility: "public",
  dependencies: [],
  implies: [{ targetKind: "server", moduleId: serverTodoModuleFixture.id }],
  children: [],
});

const dddServerHttpModuleFixture = makeCatalogModule({
  id: "server-http-api",
  title: "HTTP API Server",
  description: "REST API server with DDD shared-domain composition",
  visibility: "public",
  architecture: "ddd",
  supportedArchitectures: ["ddd"],
  dependencies: [
    {
      _tag: "required-module",
      target: { kind: "package", name: "shared-domain" },
      moduleId: "package-shared-domain",
      architecture: "ddd",
    },
  ],
  implies: [],
  children: [],
});

const dddServerTodoModuleFixture = makeCatalogModule({
  id: "server-http-api-todos",
  title: "Todo HTTP API",
  description: "DDD Todo HTTP API with an in-memory baseline",
  visibility: "public",
  architecture: "ddd",
  supportedArchitectures: ["ddd"],
  dependencies: [
    {
      _tag: "required-module",
      target: { kind: "server", name: "api" },
      moduleId: "server-http-api",
    },
  ],
  implies: [],
  children: [],
});

const dddClientTodoModuleFixture = makeCatalogModule({
  id: "client-react-http-api-todos",
  title: "Todo HTTP Client",
  description: "DDD Todo HTTP client backed by the canonical HTTP API",
  visibility: "public",
  architecture: "ddd",
  supportedArchitectures: ["ddd"],
  dependencies: [],
  implies: [
    {
      targetKind: "server",
      target: { kind: "server", name: "api" },
      moduleId: dddServerTodoModuleFixture.id,
      reason: "The DDD Todo client requires the Todo HTTP API.",
    },
  ],
  children: [],
});

export const clientTargetFixture: TargetInstance = {
  id: "client-1",
  kind: "client-react",
  name: "web",
  modules: ["config-typescript-vite"],
};

export const serverTargetFixture: TargetInstance = {
  id: "server-1",
  kind: "server",
  name: "api",
  modules: ["server-http-api"],
};

export const recipeCatalogFixture = Schema.decodeUnknownSync(
  RecipeBuilderCatalog,
)({
  targets: [
    {
      kind: "client-react",
      title: "Client React Application",
      description: "A frontend application built with React",
      defaultName: "web",
      requiredModules: ["config-typescript-vite"],
    },
    {
      kind: "server",
      title: "Server Application",
      description: "A backend application, such as an API server",
      defaultName: "api",
      requiredModules: ["server-http-api"],
    },
    {
      kind: "server-mcp",
      title: "MCP Server Application",
      description: "A Model Context Protocol server",
      defaultName: "",
      requiredModules: [],
    },
  ],
  targetModules: [
    {
      owner: { kind: "client-react", name: "web" },
      modules: [
        configTypescriptViteModuleFixture,
        clientModuleFixture,
        clientTodoModuleFixture,
      ],
    },
    {
      owner: { kind: "server", name: "api" },
      modules: [serverHttpModuleFixture, serverTodoModuleFixture],
    },
    {
      owner: { kind: "package", name: "domain" },
      modules: [domainApiModuleFixture],
    },
    {
      owner: { kind: "package", name: "db" },
      modules: [
        sqliteModuleFixture,
        postgresModuleFixture,
        todoRepositoryModuleFixture,
      ],
    },
    {
      owner: { kind: "server-mcp", name: "" },
      modules: [],
    },
  ],
  configuration: {
    monorepo: [
      {
        id: "workspace-monorepo-turbo",
        title: "Turborepo",
        description: "Monorepo build orchestration with caching",
        value: "turbo",
      },
    ],
    lint: [
      {
        id: "workspace-quality-biome-lint",
        title: "Biome",
        description: "Fast linter with recommended defaults",
        value: "biome",
      },
    ],
    format: [
      {
        id: "workspace-quality-biome-format",
        title: "Biome",
        description: "Fast formatter with recommended defaults",
        value: "biome",
      },
    ],
    test: [
      {
        id: "workspace-test-vitest",
        title: "Vitest",
        description: "Unit and integration testing framework",
        value: "vitest",
      },
    ],
    devenv: [],
  },
});

export const dddRecipeCatalogFixture = Schema.decodeUnknownSync(
  RecipeBuilderCatalog,
)({
  targets: [
    {
      kind: "client-react",
      title: "Client React Application",
      description: "A frontend application built with React",
      defaultName: "web",
      requiredModules: ["config-typescript-vite"],
      supportedArchitectures: ["ddd"],
    },
    {
      kind: "server",
      title: "Server Application",
      description: "A backend application, such as an API server",
      defaultName: "api",
      requiredModules: ["server-http-api"],
      supportedArchitectures: ["ddd"],
    },
  ],
  targetModules: [
    {
      owner: { kind: "client-react", name: "web" },
      modules: [
        configTypescriptViteModuleFixture,
        makeCatalogModule({
          ...clientModuleFixture,
          availability: {
            enabled: false,
            code: "unsupported-architecture",
            reason:
              "Classic only. DDD currently supports the Todo HTTP client and Todo HTTP API.",
            action:
              "Select a supported Todo HTTP module or use Classic architecture.",
          },
        }),
        dddClientTodoModuleFixture,
      ],
    },
    {
      owner: { kind: "server", name: "api" },
      modules: [dddServerHttpModuleFixture, dddServerTodoModuleFixture],
    },
  ],
  configuration: recipeCatalogFixture.configuration,
});

export const fullStackRecipeFixture: RecipeBuilderFormValues = {
  config: {
    name: "full-stack-app",
    runtime: { _tag: "bun" },
    typescript: "6",
    monorepo: "turbo",
    lint: "biome",
    format: "biome",
    test: "vitest",
  },
  gitEnabled: true,
  architecture: "classic",
  database: "none",
  developerExperienceModules: [],
  targets: [
    {
      ...clientTargetFixture,
      modules: ["config-typescript-vite", "client-react-http-api"],
    },
    {
      id: "implied-server-1",
      kind: "server",
      name: "api",
      modules: ["server-http-api"],
      requirements: [
        {
          sourceTargetId: "client-1",
          sourceModuleId: "client-react-http-api",
          moduleId: "server-http-api",
          addedModule: true,
        },
      ],
      addedByDependency: true,
    },
  ],
  supportSelections: [],
};
