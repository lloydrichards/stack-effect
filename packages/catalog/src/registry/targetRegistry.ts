import {
  type DesiredContributions,
  emptyDesiredContributions,
  type TargetKind,
} from "@repo/domain/Scaffold";
import {
  clientAppTsxContents,
  clientAtomContents,
  clientIndexCssContents,
  clientIndexHtmlContents,
  clientMainTsxContents,
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

type TargetDefinition = {
  readonly kind: typeof TargetKind.Type;
  readonly title: string;
  readonly description: string;
  readonly contributions: typeof DesiredContributions.Type;
};

export const targetRegistry: ReadonlyArray<TargetDefinition> = [
  {
    kind: "init",
    title: "Project Initialization",
    description:
      "Set up a new project with recommended structure and configuration",
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
    kind: "client",
    title: "Client Application",
    description: "A frontend application, such as one built with React or Vue",
    contributions: {
      ...emptyDesiredContributions(),
      files: [
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
    kind: "server",
    title: "Server Application",
    description: "A backend application, such as an API server",
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
    kind: "cli",
    title: "CLI Application",
    description: "A command-line interface application",
    contributions: emptyDesiredContributions(),
  },

  {
    kind: "package",
    title: "Shared Package",
    description: "A shared library package for code reuse across targets",
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
