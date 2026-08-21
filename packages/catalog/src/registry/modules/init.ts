import {
  ModuleCategory,
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  biomeJsoncContents,
  devcontainerJsonContents,
  dprintJsonContents,
  envrcContents,
  flakeNixContents,
  nxHashEnvContents,
  nxJsonContents,
  oxfmtJsoncContents,
  oxfmtVscodeExtensionsContents,
  turboJsonContents,
  vitePlusConfigContents,
  vitestConfigContents,
  workspaceVscodeSettingsContents,
} from "../content/init";

const gitInitModule: typeof ModuleDefinition.Type = {
  id: ModuleId.make("workspace-devenv-git"),
  title: "Git",
  description: "Initialize a git repository with an initial commit",
  visibility: "internal",
  categories: [ModuleCategory.make("git")],
  supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
  dependencies: [
    {
      _tag: "required-target",
      identity: new TargetIdentity({
        kind: TargetKind.make("workspace"),
        name: "root",
      }),
    },
  ],
  contributions: [],
  scripts: [
    {
      label: "Initialize git repository",
      command: "git init --initial-branch=main",
      phase: "post-finalize",
    },
    {
      label: "Stage all files",
      command: "git add -A",
      phase: "post-finalize",
    },
    {
      label: "Create initial commit",
      command: 'git commit -m "initial commit"',
      phase: "post-finalize",
    },
  ],
};

const nixFlakeModule: typeof ModuleDefinition.Type = {
  id: ModuleId.make("workspace-devenv-nix-flake"),
  title: "Nix Flake",
  description: "Declarative development environment with Nix",
  visibility: "internal",
  categories: [ModuleCategory.make("devenv")],
  supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
  dependencies: [
    {
      _tag: "required-target",
      identity: new TargetIdentity({
        kind: TargetKind.make("workspace"),
        name: "root",
      }),
    },
  ],
  contributions: [
    {
      _tag: "file",
      path: "{{targetPath}}/flake.nix",
      contents: flakeNixContents,
    },
    {
      _tag: "file",
      path: "{{targetPath}}/.envrc",
      contents: envrcContents,
    },
  ],
  nextSteps: [
    "Nix Flake: Install Nix with flakes enabled (https://github.com/DeterminateSystems/nix-installer)",
    "Nix Flake: Run `git add flake.nix .envrc` then `nix develop` to enter the dev shell",
    "Nix Flake: Or use direnv: install direnv, then run `direnv allow`",
  ],
};

const devcontainerModule: typeof ModuleDefinition.Type = {
  id: ModuleId.make("workspace-devenv-devcontainer"),
  title: "Dev Container",
  description: "VS Code/GitHub Codespaces development container",
  visibility: "internal",
  categories: [ModuleCategory.make("devenv")],
  supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
  dependencies: [
    {
      _tag: "required-target",
      identity: new TargetIdentity({
        kind: TargetKind.make("workspace"),
        name: "root",
      }),
    },
  ],
  contributions: [
    {
      _tag: "file",
      path: "{{targetPath}}/.devcontainer/devcontainer.json",
      contents: devcontainerJsonContents,
    },
  ],
  nextSteps: [
    "Dev Container: Open in VS Code and run 'Dev Containers: Reopen in Container'",
    "Dev Container: Or create a GitHub Codespace from the repository",
  ],
};

export const initModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("workspace-typescript-6"),
    title: "TypeScript 6",
    description: "TypeScript 6 with the Effect language-service plugin",
    visibility: "internal",
    categories: [ModuleCategory.make("typescript")],
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [
      {
        _tag: "required-target",
        identity: new TargetIdentity({
          kind: TargetKind.make("workspace"),
          name: "root",
        }),
      },
    ],
    contributions: [
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "@effect/language-service",
        value: "^0.87.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "typescript",
        value: "6.0.3",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "prepare",
        value: "effect-language-service patch",
      },
    ],
  },
  {
    id: ModuleId.make("workspace-typescript-7"),
    title: "TypeScript 7",
    description: "TypeScript 7 with the native Effect TypeScript-Go server",
    visibility: "internal",
    categories: [ModuleCategory.make("typescript")],
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [
      {
        _tag: "required-target",
        identity: new TargetIdentity({
          kind: TargetKind.make("workspace"),
          name: "root",
        }),
      },
    ],
    contributions: [
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "@effect/tsgo",
        value: "^0.22.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "typescript",
        value: "7.0.2",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "prepare",
        value: "effect-tsgo patch",
      },
    ],
    nextSteps: [
      "TypeScript 7: Configure your editor to use Effect TSGo as its sole TypeScript language server.",
    ],
  },
  {
    id: ModuleId.make("workspace-monorepo-turbo"),
    title: "Turborepo",
    description: "Monorepo build orchestration with caching",
    visibility: "internal",
    categories: [ModuleCategory.make("monorepo")],
    conflictsWith: [
      ModuleId.make("workspace-monorepo-vite-plus"),
      ModuleId.make("workspace-monorepo-nx"),
    ],
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [
      {
        _tag: "required-target",
        identity: new TargetIdentity({
          kind: TargetKind.make("workspace"),
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
    id: ModuleId.make("workspace-monorepo-nx"),
    title: "Nx",
    description:
      "Package-based monorepo task orchestration and caching with Nx",
    visibility: "internal",
    categories: [ModuleCategory.make("monorepo")],
    conflictsWith: [
      ModuleId.make("workspace-monorepo-turbo"),
      ModuleId.make("workspace-monorepo-vite-plus"),
    ],
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [
      {
        _tag: "required-target",
        identity: new TargetIdentity({
          kind: TargetKind.make("workspace"),
          name: "root",
        }),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/nx.json",
        contents: nxJsonContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/scripts/hash-env.mjs",
        contents: nxHashEnvContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "nx",
        value: "^23.1.1",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build",
        value: "nx run-many -t build",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev",
        value: "nx run-many -t dev",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "type-check",
        value: "nx run-many -t type-check",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "clean",
        value:
          "nx reset && nx run-many -t clean && git clean -xdf node_modules .cache .nx/cache .nx/workspace-data dist tsconfig.tsbuildinfo",
      },
    ],
  },
  {
    id: ModuleId.make("workspace-monorepo-vite-plus"),
    title: "Vite+",
    description: "Monorepo task orchestration and caching with Vite+",
    visibility: "internal",
    categories: [ModuleCategory.make("monorepo")],
    conflictsWith: [
      ModuleId.make("workspace-monorepo-turbo"),
      ModuleId.make("workspace-monorepo-nx"),
    ],
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [
      {
        _tag: "required-target",
        identity: new TargetIdentity({
          kind: TargetKind.make("workspace"),
          name: "root",
        }),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/vite.config.ts",
        contents: vitePlusConfigContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "vite-plus",
        value: "^0.2.8",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "build",
        value: "vp run -r build",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "dev",
        value: "vp run -r --parallel --no-cache dev",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "type-check",
        value: "vp run -r type-check",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "clean",
        value:
          'vp cache clean && vp run --no-cache --filter "./apps/*" --filter "./packages/*" clean && git clean -xdf node_modules .cache dist tsconfig.tsbuildinfo',
      },
    ],
    nextSteps: [
      "Vite+: Install the separate global `vp` executable (https://viteplus.dev/guide/)",
    ],
  },
  {
    id: ModuleId.make("workspace-quality-biome"),
    title: "Biome",
    description: "Shared Biome dependency and configuration",
    visibility: "internal",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [
      {
        _tag: "required-target",
        identity: new TargetIdentity({
          kind: TargetKind.make("workspace"),
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
        _tag: "file",
        path: "{{targetPath}}/.vscode/settings.json",
        contents: workspaceVscodeSettingsContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "@biomejs/biome",
        value: "2.5.2",
      },
    ],
  },
  {
    id: ModuleId.make("workspace-quality-biome-lint"),
    title: "Biome",
    description: "Fast linter with recommended defaults",
    visibility: "internal",
    categories: [ModuleCategory.make("lint")],
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("workspace"),
          name: "root",
        }),
        moduleId: ModuleId.make("workspace-quality-biome"),
      },
    ],
    contributions: [
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "lint",
        value: "biome lint .",
      },
    ],
  },
  {
    id: ModuleId.make("workspace-quality-biome-format"),
    title: "Biome",
    description: "Fast formatter with recommended defaults",
    visibility: "internal",
    categories: [ModuleCategory.make("format")],
    conflictsWith: [
      ModuleId.make("workspace-quality-dprint"),
      ModuleId.make("workspace-quality-oxfmt"),
    ],
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [
      {
        _tag: "required-module",
        target: new TargetIdentity({
          kind: TargetKind.make("workspace"),
          name: "root",
        }),
        moduleId: ModuleId.make("workspace-quality-biome"),
      },
    ],
    contributions: [
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
    id: ModuleId.make("workspace-quality-oxfmt"),
    title: "Oxfmt",
    description: "High-performance formatter for the JavaScript ecosystem",
    visibility: "internal",
    categories: [ModuleCategory.make("format")],
    conflictsWith: [
      ModuleId.make("workspace-quality-biome-format"),
      ModuleId.make("workspace-quality-dprint"),
    ],
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [
      {
        _tag: "required-target",
        identity: new TargetIdentity({
          kind: TargetKind.make("workspace"),
          name: "root",
        }),
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/.oxfmtrc.jsonc",
        contents: oxfmtJsoncContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/.vscode/settings.json",
        contents: workspaceVscodeSettingsContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/.vscode/extensions.json",
        contents: oxfmtVscodeExtensionsContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "oxfmt",
        value: "^0.62.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "format",
        value: "oxfmt",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "format:check",
        value: "oxfmt --check",
      },
    ],
  },
  {
    id: ModuleId.make("workspace-quality-dprint"),
    title: "dprint",
    description: "Fast pluggable formatter used by the Effect team",
    visibility: "internal",
    categories: [ModuleCategory.make("format")],
    conflictsWith: [
      ModuleId.make("workspace-quality-biome-format"),
      ModuleId.make("workspace-quality-oxfmt"),
    ],
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [
      {
        _tag: "required-target",
        identity: new TargetIdentity({
          kind: TargetKind.make("workspace"),
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
    id: ModuleId.make("workspace-quality-oxlint"),
    title: "oxlint",
    description: "Fast Rust-based linter used by the Effect team",
    visibility: "internal",
    categories: [ModuleCategory.make("lint")],
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [
      {
        _tag: "required-target",
        identity: new TargetIdentity({
          kind: TargetKind.make("workspace"),
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
    id: ModuleId.make("workspace-test-vitest"),
    title: "Vitest",
    description: "Unit and integration testing framework",
    visibility: "internal",
    categories: [ModuleCategory.make("test")],
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [
      {
        _tag: "required-target",
        identity: new TargetIdentity({
          kind: TargetKind.make("workspace"),
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
        value:
          "{{#if monorepo=turbo}}turbo run test{{/if}}{{#if monorepo=vite-plus}}vp run -r test{{/if}}{{#if monorepo=nx}}nx run-many -t test{{/if}}",
      },
    ],
  },
  gitInitModule,
  nixFlakeModule,
  devcontainerModule,
];
