import {
  ModuleId,
  type TargetDefinition,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  cliIndexContents,
  cliPackageJsonContents,
  cliTsconfigContents,
} from "./content/cli";
import {
  clientAppTsxContents,
  clientIndexCssContents,
  clientIndexHtmlContents,
  clientMainTsxContents,
  clientPackageJsonContents,
  clientShadcnComponentJson,
  clientTsconfigConfigContents,
  clientTsconfigContents,
  clientUtilsContents,
  clientViteConfigContents,
  clientViteEnvContents,
} from "./content/client";
import {
  configTypescriptBaseContents,
  configTypescriptPackageJsonContents,
  gitignoreContents,
  rootPackageJsonContents,
  rootTsconfigContents,
} from "./content/init";
import {
  serverIndexContents,
  serverPackageJsonContents,
  serverTsconfigContents,
} from "./content/server";
import {
  packageDomainTsconfigContents,
  packagePackageJsonContents,
} from "./content/shared";

export const targetRegistry: ReadonlyArray<typeof TargetDefinition.Type> = [
  {
    kind: TargetKind.make("init"),
    title: "Project Initialization",
    description:
      "Set up a new project with recommended structure and configuration",
    visibility: "internal",
    requiredModules: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/.gitignore",
        contents: gitignoreContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: rootPackageJsonContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.json",
        contents: rootTsconfigContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/packages/config-typescript/base.json",
        contents: configTypescriptBaseContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/packages/config-typescript/package.json",
        contents: configTypescriptPackageJsonContents,
      },
    ],
  },

  {
    kind: TargetKind.make("client"),
    title: "Client Application",
    description: "A frontend application, such as one built with React or Vue",
    requiredModules: [ModuleId.make("config-typescript-vite")],
    contributions: [
      // Files
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: clientPackageJsonContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/index.html",
        contents: clientIndexHtmlContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/components.json",
        contents: clientShadcnComponentJson,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/main.tsx",
        contents: clientMainTsxContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/app.tsx",
        contents: clientAppTsxContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.css",
        contents: clientIndexCssContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/vite.config.ts",
        contents: clientViteConfigContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.config.json",
        contents: clientTsconfigConfigContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/lib/utils.ts",
        contents: clientUtilsContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/vite-env.d.ts",
        contents: clientViteEnvContents,
      },
      // TSConfig (conflict on modify)
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.json",
        contents: clientTsconfigContents,
        conflictOnModify: true,
      },
      // Scripts
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build",
        value: "vite build",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev",
        value: "vite --host --clearScreen false",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "test",
        value: "vitest run",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "type-check",
        value: "tsc --noEmit",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "preview",
        value: "vite preview",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "clean",
        value: "git clean -xdf .cache .turbo dist node_modules",
      },
    ],
  },

  {
    kind: TargetKind.make("server"),
    title: "Server Application",
    description: "A backend application, such as an API server",
    requiredModules: [ModuleId.make("http-api-server")],
    contributions: [
      // Files
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: serverPackageJsonContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.ts",
        contents: serverIndexContents,
      },
      // TSConfig (conflict on modify)
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.json",
        contents: serverTsconfigContents,
        conflictOnModify: true,
      },
      // Scripts
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build",
        value: "bun build src/index.ts --outdir=dist --target=bun --minify",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build:types",
        value: "tsc --emitDeclarationOnly",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev",
        value: "bun --watch run src/index.ts",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "test",
        value: "vitest run",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "type-check",
        value: "tsc --noEmit",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "clean",
        value: "git clean -xdf .cache .turbo dist node_modules",
      },
    ],
  },

  {
    kind: TargetKind.make("cli"),
    title: "CLI Application",
    description: "A command-line interface application",
    requiredModules: [ModuleId.make("hello-command")],
    contributions: [
      // Files
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: cliPackageJsonContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/src/index.ts",
        contents: cliIndexContents,
      },
      // TSConfig (conflict on modify)
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.json",
        contents: cliTsconfigContents,
        conflictOnModify: true,
      },
      // Scripts
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build",
        value: "bun build src/index.ts --outdir=dist --target=bun --minify",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build:types",
        value: "tsc --emitDeclarationOnly",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev",
        value: "bun --watch run src/index.ts",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "test",
        value: "vitest run",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "type-check",
        value: "tsc --noEmit",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "clean",
        value: "git clean -xdf .cache .turbo dist node_modules",
      },
    ],
  },

  {
    kind: TargetKind.make("package"),
    title: "Shared Package",
    description: "A shared library package for code reuse across targets",
    visibility: "internal",
    requiredModules: [],
    contributions: [
      // Files
      {
        _tag: "file",
        path: "{{targetPath}}/package.json",
        contents: packagePackageJsonContents,
      },
      // TSConfig (conflict on modify)
      {
        _tag: "file",
        path: "{{targetPath}}/tsconfig.json",
        contents: packageDomainTsconfigContents,
        conflictOnModify: true,
      },
      // Scripts
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "type-check",
        value: "tsc --noEmit",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "clean",
        value:
          "git clean -xdf .cache .turbo dist node_modules tsconfig.tsbuildinfo",
      },
    ],
  },
];
