import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  biomeJsoncContents,
  turboJsonContents,
  vitestConfigContents,
} from "../content/init";

/**
 * Init modules - project-wide tooling (turbo, biome, vitest)
 */
export const initModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("turbo"),
    title: "Turborepo",
    description: "Monorepo build orchestration with caching",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("init") }],
    dependencies: [
      {
        _tag: "required-target",
        identity: new TargetIdentity({
          kind: TargetKind.make("init"),
          name: "root",
        }),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/turbo.json",
        contents: turboJsonContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "turbo",
        value: "^2.9.6",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build",
        value: "turbo run build",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev",
        value: "turbo run dev",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "type-check",
        value: "turbo run type-check",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "clean",
        value:
          "turbo run clean && git clean -xdf node_modules .cache .turbo dist tsconfig.tsbuildinfo",
      },
    ],
  },
  {
    id: ModuleId.make("biome"),
    title: "Biome",
    description: "Fast linter and formatter",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("init") }],
    dependencies: [
      {
        _tag: "required-target",
        identity: new TargetIdentity({
          kind: TargetKind.make("init"),
          name: "root",
        }),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/biome.jsonc",
        contents: biomeJsoncContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "@biomejs/biome",
        value: "2.4.11",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "lint",
        value: "biome lint .",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "format",
        value: "biome check --write .",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "format:check",
        value: "biome check .",
      },
    ],
  },
  {
    id: ModuleId.make("vitest"),
    title: "Vitest",
    description: "Unit and integration testing framework",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("init") }],
    dependencies: [
      {
        _tag: "required-target",
        identity: new TargetIdentity({
          kind: TargetKind.make("init"),
          name: "root",
        }),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/vitest.config.ts",
        contents: vitestConfigContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "vitest",
        value: "^4.1.4",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "test",
        value: "turbo run test",
      },
    ],
  },
];
