import {
  ModuleId,
  type TargetDefinition,
  TargetKind,
} from "@repo/domain/Catalog";
import { emptyDesiredContributions } from "@repo/domain/Scaffold";
import {
  clientAppTsxContents,
  clientAtomContents,
  clientIndexCssContents,
  clientIndexHtmlContents,
  clientMainTsxContents,
  clientPackageJsonContents,
  clientTsconfigConfigContents,
  clientTsconfigContents,
  clientUtilsContents,
  clientViteConfigContents,
} from "./content/client";
import {
  configTypescriptBaseContents,
  configTypescriptPackageJsonContents,
  gitignoreContents,
  rootPackageJsonContents,
  rootTsconfigContents,
} from "./content/init";
import { serverIndexContents, serverTsconfigContents } from "./content/server";
import { packageDomainTsconfigContents } from "./content/shared";

export const targetRegistry: ReadonlyArray<typeof TargetDefinition.Type> = [
  {
    kind: TargetKind.make("init"),
    title: "Project Initialization",
    description:
      "Set up a new project with recommended structure and configuration",
    requiredModules: [],
    contributions: {
      ...emptyDesiredContributions(),
      files: [
        { path: "{{targetPath}}/.gitignore", contents: gitignoreContents },
        {
          path: "{{targetPath}}/package.json",
          contents: rootPackageJsonContents,
        },
        {
          path: "{{targetPath}}/tsconfig.json",
          contents: rootTsconfigContents,
        },
        {
          path: "{{targetPath}}/packages/config-typescript/base.json",
          contents: configTypescriptBaseContents,
        },
        {
          path: "{{targetPath}}/packages/config-typescript/package.json",
          contents: configTypescriptPackageJsonContents,
        },
      ],
    },
  },

  {
    kind: TargetKind.make("client"),
    title: "Client Application",
    description: "A frontend application, such as one built with React or Vue",
    requiredModules: [ModuleId.make("config-typescript-vite")],
    contributions: {
      ...emptyDesiredContributions(),
      files: [
        {
          path: "{{targetPath}}/package.json",
          contents: clientPackageJsonContents,
        },
        {
          path: "{{targetPath}}/index.html",
          contents: clientIndexHtmlContents,
        },
        {
          path: "{{targetPath}}/src/main.tsx",
          contents: clientMainTsxContents,
        },
        {
          path: "{{targetPath}}/src/app.tsx",
          contents: clientAppTsxContents,
        },
        {
          path: "{{targetPath}}/src/index.css",
          contents: clientIndexCssContents,
        },
        {
          path: "{{targetPath}}/vite.config.ts",
          contents: clientViteConfigContents,
        },
        {
          path: "{{targetPath}}/tsconfig.config.json",
          contents: clientTsconfigConfigContents,
        },
        {
          path: "{{targetPath}}/src/lib/utils.ts",
          contents: clientUtilsContents,
        },
        {
          path: "{{targetPath}}/src/lib/atom.ts",
          contents: clientAtomContents,
        },
      ],
      scripts: [
        {
          path: "{{targetPath}}/package.json",
          name: "build",
          value: "vite build",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "dev",
          value: "vite --host --clearScreen false",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "test",
          value: "vitest run",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "type-check",
          value: "tsc --noEmit",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "preview",
          value: "vite preview",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "clean",
          value: "git clean -xdf .cache .turbo dist node_modules",
        },
      ],
      tsconfigs: [
        {
          path: "{{targetPath}}/tsconfig.json",
          contents: clientTsconfigContents,
        },
      ],
    },
  },

  {
    kind: TargetKind.make("server"),
    title: "Server Application",
    description: "A backend application, such as an API server",
    requiredModules: [],
    contributions: {
      ...emptyDesiredContributions(),
      files: [
        {
          path: "{{targetPath}}/src/index.ts",
          contents: serverIndexContents,
        },
      ],
      scripts: [
        {
          path: "{{targetPath}}/package.json",
          name: "build",
          value: "bun build src/index.ts --outdir=dist --target=bun --minify",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "build:types",
          value: "tsc --emitDeclarationOnly",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "dev",
          value: "bun --watch run src/index.ts",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "test",
          value: "vitest run",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "type-check",
          value: "tsc --noEmit",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "clean",
          value: "git clean -xdf .cache .turbo dist node_modules",
        },
      ],
      tsconfigs: [
        {
          path: "{{targetPath}}/tsconfig.json",
          contents: serverTsconfigContents,
        },
      ],
    },
  },

  {
    kind: TargetKind.make("cli"),
    title: "CLI Application",
    description: "A command-line interface application",
    requiredModules: [],
    contributions: emptyDesiredContributions(),
  },

  {
    kind: TargetKind.make("package"),
    title: "Shared Package",
    description: "A shared library package for code reuse across targets",
    requiredModules: [],
    contributions: {
      ...emptyDesiredContributions(),
      scripts: [
        {
          path: "{{targetPath}}/package.json",
          name: "type-check",
          value: "tsc --noEmit",
        },
        {
          path: "{{targetPath}}/package.json",
          name: "clean",
          value:
            "git clean -xdf .cache .turbo dist node_modules tsconfig.tsbuildinfo",
        },
      ],
      tsconfigs: [
        {
          path: "{{targetPath}}/tsconfig.json",
          contents: packageDomainTsconfigContents,
        },
      ],
    },
  },
];
