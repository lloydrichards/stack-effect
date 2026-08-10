import type { BuilderCatalogOutputWire } from "../../worker/recipe-preview-protocol";
import type {
  CatalogModule,
  RecipeBuilderFormValues,
  TargetInstance,
} from "./recipe-builder-form";

const configTypescriptViteModuleFixture: CatalogModule = {
  id: "config-typescript-vite",
  title: "Config TypeScript Vite",
  description: "Vite TypeScript preset for client applications",
  visibility: "internal",
  dependencies: [],
  implications: [],
  children: [],
};

const domainApiModuleFixture: CatalogModule = {
  id: "domain-api-contracts",
  title: "Domain API",
  description: "Shared domain schemas and HTTP API definitions",
  visibility: "internal",
  dependencies: [],
  implications: [],
  children: [],
};

const serverHttpModuleFixture: CatalogModule = {
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
  implications: [],
  children: [],
};

export const clientModuleFixture: CatalogModule = {
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
  implications: [{ targetKind: "server", moduleId: "server-http-api" }],
  children: [],
};

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

export const recipeCatalogFixture: BuilderCatalogOutputWire = {
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
      modules: [configTypescriptViteModuleFixture, clientModuleFixture],
    },
    {
      owner: { kind: "server", name: "api" },
      modules: [serverHttpModuleFixture],
    },
    {
      owner: { kind: "package", name: "domain" },
      modules: [domainApiModuleFixture],
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
    developerExperience: [],
  },
};

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
