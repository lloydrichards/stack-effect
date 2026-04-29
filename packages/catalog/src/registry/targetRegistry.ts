import {
  type DesiredContributions,
  emptyDesiredContributions,
  type TargetKind,
} from "@repo/domain/Scaffold";
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
  readonly contributions: typeof DesiredContributions.Type;
};

export const targetRegistry: ReadonlyArray<TargetDefinition> = [
  {
    kind: "init",
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
    contributions: emptyDesiredContributions(),
  },

  {
    kind: "server",
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
    contributions: emptyDesiredContributions(),
  },

  {
    kind: "package",
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
