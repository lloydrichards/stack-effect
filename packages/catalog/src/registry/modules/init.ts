import {
  ModuleCategory,
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  biomeJsoncContents,
  biomeVscodeSettingsContents,
  devcontainerJsonContents,
  dprintJsonContents,
  envrcContents,
  flakeNixContents,
  turboJsonContents,
  vitestConfigContents,
} from "../content/init";

/**
 * Workspace modules - project-wide tooling (turbo, biome, vitest)
 */
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
    id: ModuleId.make("workspace-monorepo-turbo"),
    title: "Turborepo",
    description: "Monorepo build orchestration with caching",
    visibility: "internal",
    categories: [ModuleCategory.make("monorepo")],
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
    id: ModuleId.make("workspace-quality-biome"),
    title: "Biome",
    description: "Fast linter and formatter",
    visibility: "internal",
    categories: [ModuleCategory.make("lint"), ModuleCategory.make("format")],
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
        contents: biomeVscodeSettingsContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "@biomejs/biome",
        value: "2.5.0",
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
    id: ModuleId.make("workspace-quality-dprint"),
    title: "dprint",
    description: "Fast pluggable formatter used by the Effect team",
    visibility: "internal",
    categories: [ModuleCategory.make("format")],
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
        value: "turbo run test",
      },
    ],
  },
  gitInitModule,
  nixFlakeModule,
  devcontainerModule,
];
