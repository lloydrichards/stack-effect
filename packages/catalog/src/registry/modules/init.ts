import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  biomeJsoncContents,
  dprintJsonContents,
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
    visibility: "internal",
    initCategory: ["monorepo"],
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
    visibility: "internal",
    initCategory: ["lint", "format"],
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
    id: ModuleId.make("dprint"),
    title: "dprint",
    description: "Fast pluggable formatter used by the Effect team",
    visibility: "internal",
    initCategory: ["format"],
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
        path: "{{targetPath}}/dprint.json",
        contents: dprintJsonContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "dprint",
        value: "^0.54.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "format",
        value: "dprint fmt",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "format:check",
        value: "dprint check",
      },
    ],
  },
  {
    id: ModuleId.make("oxlint"),
    title: "oxlint",
    description: "Fast Rust-based linter used by the Effect team",
    visibility: "internal",
    initCategory: ["lint"],
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
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "oxlint",
        value: "^1.42.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "lint",
        value: "oxlint",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "lint:fix",
        value: "oxlint --fix",
      },
    ],
  },
  {
    id: ModuleId.make("vitest"),
    title: "Vitest",
    description: "Unit and integration testing framework",
    visibility: "internal",
    initCategory: ["test"],
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
