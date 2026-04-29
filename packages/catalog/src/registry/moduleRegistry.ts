import { type ModuleDefinition, TargetIdentity } from "@repo/domain/Catalog";
import {
  domainApiContents,
  serverHealthContents,
  serverHelloContents,
} from "./content/api";
import {
  clientHelloAtomContents,
  clientRestCardContents,
  clientViteEnvContents,
} from "./content/client-api";
import {
  biomeJsoncContents,
  turboJsonContents,
  vitestConfigContents,
} from "./content/init";

export const moduleRegistry: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: "turbo",
    title: "Turborepo",
    description: "Monorepo build orchestration with caching",
    supportedOn: [{ _tag: "kind", kind: "init" }],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({ kind: "init", name: "root" }),
        },
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/turbo.json",
          contents: turboJsonContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "devDependencies",
          name: "turbo",
          value: "^2.9.6",
        },
      ],
      scripts: [
        {
          path: "{{targetPath}}/package.json",
          name: "build",
          value: "turbo run build",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "dev",
          value: "turbo run dev",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "type-check",
          value: "turbo run type-check",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "clean",
          value:
            "turbo run clean && git clean -xdf node_modules .cache .turbo dist tsconfig.tsbuildinfo",
        },
      ],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  {
    id: "biome",
    title: "Biome",
    description: "Fast linter and formatter",
    supportedOn: [{ _tag: "kind", kind: "init" }],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({ kind: "init", name: "root" }),
        },
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/biome.jsonc",
          contents: biomeJsoncContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "devDependencies",
          name: "@biomejs/biome",
          value: "2.4.11",
        },
      ],
      scripts: [
        {
          path: "{{targetPath}}/package.json",
          name: "lint",
          value: "biome lint .",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "format",
          value: "biome check --write .",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "format:check",
          value: "biome check .",
        },
      ],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  {
    id: "vitest",
    title: "Vitest",
    description: "Unit and integration testing framework",
    supportedOn: [{ _tag: "kind", kind: "init" }],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({ kind: "init", name: "root" }),
        },
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/vitest.config.ts",
          contents: vitestConfigContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "devDependencies",
          name: "vitest",
          value: "^4.1.4",
        },
      ],
      scripts: [
        {
          path: "{{targetPath}}/package.json",
          name: "test",
          value: "turbo run test",
        },
      ],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  // ---------------------------------------------------------------------------
  // add modules — app/package feature modules
  // ---------------------------------------------------------------------------
  {
    id: "domain-api",
    title: "Domain API",
    description: "Shared domain schemas and RPC definitions",
    supportedOn: [
      {
        _tag: "identity",
        identity: new TargetIdentity({
          kind: "package",
          name: "domain",
        }),
      },
    ],
    dependencies: [],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/Api.ts",
          contents: domainApiContents,
        },
      ],
      exports: [
        {
          path: "{{targetPath}}/package.json",
          name: "./Api",
          value: "./src/Api.ts",
        },
      ],
      dependencies: [],
      scripts: [],
      barrelExports: [
        {
          barrelPath: "{{targetPath}}/src/index.ts",
          exportPath: "./Api",
        },
      ],
      tsconfigs: [],
    },
  },
  {
    id: "http-api-server",
    title: "HTTP API Server",
    description: "REST API endpoints with Effect HTTP",
    supportedOn: [
      {
        _tag: "kind",
        kind: "server",
      },
    ],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: "package",
            name: "domain",
          }),
        },
        requiredModule: {
          target: new TargetIdentity({
            kind: "package",
            name: "domain",
          }),
          moduleId: "domain-api",
        },
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/Api/Health.ts",
          contents: serverHealthContents,
        },
        {
          path: "{{targetPath}}/src/Api/Hello.ts",
          contents: serverHelloContents,
        },
      ],
      exports: [],
      dependencies: [],
      scripts: [],
      barrelExports: [],
      tsconfigs: [],
    },
  },
  {
    id: "http-api-client",
    title: "HTTP API Client",
    description: "REST API client with Effect Atom and typed HttpApiClient",
    supportedOn: [
      {
        _tag: "kind",
        kind: "client",
      },
    ],
    dependencies: [
      {
        requiredTarget: {
          identity: new TargetIdentity({
            kind: "package",
            name: "domain",
          }),
        },
        requiredModule: {
          target: new TargetIdentity({
            kind: "package",
            name: "domain",
          }),
          moduleId: "domain-api",
        },
      },
    ],
    contributions: {
      files: [
        {
          path: "{{targetPath}}/src/vite-env.d.ts",
          contents: clientViteEnvContents,
        },
        {
          path: "{{targetPath}}/src/lib/atoms/hello-atom.ts",
          contents: clientHelloAtomContents,
        },
        {
          path: "{{targetPath}}/src/components/rest-card.tsx",
          contents: clientRestCardContents,
        },
      ],
      exports: [],
      dependencies: [
        {
          path: "{{targetPath}}/package.json",
          section: "dependencies",
          name: "@repo/domain",
          value: "workspace:*",
        },
      ],
      scripts: [],
      barrelExports: [],
      tsconfigs: [],
    },
  },
];
