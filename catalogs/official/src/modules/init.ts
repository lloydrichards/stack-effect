import { defineModules, type ModuleInput, templates } from "@repo/authoring";

const template = templates(new URL("../../templates/", import.meta.url));

const gitInitModule: ModuleInput = {
  id: "workspace-devenv-git",
  supportedRuntimes: ["bun", "node", "deno"],
  title: "Git",
  description: "Initialize a git repository with an initial commit",
  visibility: "internal",
  categories: ["git"],
  supportedOn: [{ _tag: "kind", kind: "workspace" }],
  dependencies: [
    {
      _tag: "required-target",
      identity: {
        kind: "workspace",
        name: "root",
      },
    },
  ],
  contributions: [],
  scripts: [
    {
      label: "Initialize git repository and create initial commit",
      command:
        'test "$(git rev-parse --show-toplevel 2>/dev/null)" = "$PWD" || (git init --initial-branch=main && git add -A && git commit -m "initial commit")',
      phase: "post-finalize",
    },
  ],
};

const nixFlakeModule: ModuleInput = {
  id: "workspace-devenv-nix-flake",
  supportedRuntimes: ["bun", "node", "deno"],
  title: "Nix Flake",
  description: "Declarative development environment with Nix",
  visibility: "internal",
  categories: ["devenv"],
  supportedOn: [{ _tag: "kind", kind: "workspace" }],
  dependencies: [
    {
      _tag: "required-target",
      identity: {
        kind: "workspace",
        name: "root",
      },
    },
  ],
  contributions: [
    {
      _tag: "file",
      path: "{{targetPath}}/flake.nix",
      contents: template("./workspace-devenv-nix-flake/flake.nix"),
    },
    {
      _tag: "file",
      path: "{{targetPath}}/.envrc",
      contents: template("./workspace-devenv-nix-flake/.envrc"),
    },
  ],
  nextSteps: [
    "Nix Flake: Install Nix with flakes enabled (https://github.com/DeterminateSystems/nix-installer)",
    "Nix Flake: Run `git add flake.nix .envrc` then `nix develop` to enter the dev shell",
    "Nix Flake: Or use direnv: install direnv, then run `direnv allow`",
  ],
};

const devcontainerModule: ModuleInput = {
  id: "workspace-devenv-devcontainer",
  supportedRuntimes: ["bun", "node", "deno"],
  title: "Dev Container",
  description: "VS Code/GitHub Codespaces development container",
  visibility: "internal",
  categories: ["devenv"],
  supportedOn: [{ _tag: "kind", kind: "workspace" }],
  dependencies: [
    {
      _tag: "required-target",
      identity: {
        kind: "workspace",
        name: "root",
      },
    },
  ],
  contributions: [
    {
      _tag: "file",
      path: "{{targetPath}}/.devcontainer/devcontainer.json",
      contents: template(
        "./workspace-devenv-devcontainer/.devcontainer/devcontainer.json",
      ),
    },
  ],
  nextSteps: [
    "Dev Container: Open in VS Code and run 'Dev Containers: Reopen in Container'",
    "Dev Container: Or create a GitHub Codespace from the repository",
  ],
};

const huskyModule: ModuleInput = {
  id: "workspace-devenv-husky",
  supportedRuntimes: ["bun", "node", "deno"],
  title: "Husky + lint-staged",
  description: "Run staged-file format and lint tasks before each commit",
  visibility: "internal",
  categories: ["devenv"],
  supportedOn: [{ _tag: "kind", kind: "workspace" }],
  dependencies: [
    {
      _tag: "required-module",
      target: {
        kind: "workspace",
        name: "root",
      },
      moduleId: "workspace-devenv-git",
    },
  ],
  contributions: [
    {
      _tag: "file",
      path: "{{targetPath}}/.husky/pre-commit",
      contents: template("./workspace-devenv-husky/.husky/pre-commit"),
    },
    {
      _tag: "file",
      path: "{{#if runtime=bun}}{{targetPath}}/.lintstagedrc.json{{/if}}{{#if runtime=node}}{{targetPath}}/.lintstagedrc.json{{/if}}",
      contents: template("./workspace-devenv-husky/.lintstagedrc.json"),
    },
    {
      _tag: "file",
      path: "{{#if runtime=deno}}{{targetPath}}/.lintstagedrc.json{{/if}}",
      contents: template("./workspace-devenv-husky/.lintstagedrc.deno.json"),
    },
    {
      _tag: "pkg-json-entry",
      path: "{{targetPath}}/package.json",
      field: "devDependencies",
      name: "husky",
      value: "9.1.7",
    },
    {
      _tag: "pkg-json-entry",
      path: "{{targetPath}}/package.json",
      field: "devDependencies",
      name: "lint-staged",
      value: "17.4.1",
    },
    {
      _tag: "pkg-json-entry",
      path: "{{targetPath}}/package.json",
      field: "scripts",
      name: "postprepare",
      value: "husky",
    },
    {
      _tag: "pkg-json-entry",
      path: "{{targetPath}}/package.json",
      field: "scripts",
      name: "lint-staged",
      value: "lint-staged",
    },
  ],
  scripts: [
    {
      label: "Install Git hooks",
      command:
        "{{#if runtime=deno}}deno task postprepare{{/if}}{{#if runtime=bun}}bun run postprepare{{/if}}{{#if runtime=node}}{{packageManager}} run postprepare{{/if}}",
      phase: "post-finalize",
    },
  ],
};

export const initModules = defineModules(import.meta.url, [
  {
    id: "workspace-typescript-6",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "TypeScript 6",
    description: "TypeScript 6 with the Effect language-service plugin",
    visibility: "internal",
    categories: ["typescript"],
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [
      {
        _tag: "required-target",
        identity: {
          kind: "workspace",
          name: "root",
        },
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
    id: "workspace-typescript-7",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "TypeScript 7",
    description: "TypeScript 7 with the native Effect TypeScript-Go server",
    visibility: "internal",
    categories: ["typescript"],
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [
      {
        _tag: "required-target",
        identity: {
          kind: "workspace",
          name: "root",
        },
      },
    ],
    contributions: [
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "@effect/tsgo",
        value: "0.38.0",
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
        value: "effect-tsgo patch{{#if effectOxlint}} --oxlint{{/if}}",
      },
    ],
    nextSteps: [
      "TypeScript 7: Configure your editor to use Effect TSGo as its sole TypeScript language server.",
    ],
  },
  {
    id: "workspace-monorepo-turbo",
    title: "Turborepo",
    description: "Monorepo build orchestration with caching",
    visibility: "internal",
    categories: ["monorepo"],
    conflictsWith: ["workspace-monorepo-vite-plus", "workspace-monorepo-nx"],
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [
      {
        _tag: "required-target",
        identity: {
          kind: "workspace",
          name: "root",
        },
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/turbo.json",
        contents: template("./workspace-monorepo-turbo/turbo.json"),
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
    id: "workspace-monorepo-nx",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Nx",
    description:
      "Package-based monorepo task orchestration and caching with Nx",
    visibility: "internal",
    categories: ["monorepo"],
    conflictsWith: ["workspace-monorepo-turbo", "workspace-monorepo-vite-plus"],
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [
      {
        _tag: "required-target",
        identity: {
          kind: "workspace",
          name: "root",
        },
      },
    ],
    contributions: [
      // HACK: Nx 23.1.1 cannot parse Bun 1.4's lockfile version 2. Bun recipes hash
      // the lockfile through sharedGlobals instead; remove when Nx accepts version 2.
      // Nx source analysis imports TypeScript's JavaScript API, which native TS7 does
      // not expose. Generated projects declare cross-project dependencies in package
      // manifests, so Nx can build the project graph without source analysis.
      {
        _tag: "file",
        path: "{{targetPath}}/nx.json",
        contents: template("./workspace-monorepo-nx/nx.json"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/scripts/hash-env.mjs",
        contents: template("./workspace-monorepo-nx/scripts/hash-env.mjs"),
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
    id: "workspace-monorepo-vite-plus",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Vite+",
    description: "Monorepo task orchestration and caching with Vite+",
    visibility: "internal",
    categories: ["monorepo"],
    conflictsWith: ["workspace-monorepo-turbo", "workspace-monorepo-nx"],
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [
      {
        _tag: "required-target",
        identity: {
          kind: "workspace",
          name: "root",
        },
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/vite.config.ts",
        contents: template("./workspace-monorepo-vite-plus/vite.config.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "vite-plus",
        value: "0.3.0",
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
    id: "workspace-quality-biome",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Biome",
    description: "Shared Biome dependency and configuration",
    visibility: "internal",
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [
      {
        _tag: "required-target",
        identity: {
          kind: "workspace",
          name: "root",
        },
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/biome.jsonc",
        contents: template("./workspace-quality-biome/biome.jsonc"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/.vscode/settings.json",
        contents: template("./workspace-quality-biome/.vscode/settings.json"),
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
    id: "workspace-quality-biome-lint",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Biome",
    description: "Fast linter with recommended defaults",
    visibility: "internal",
    categories: ["lint"],
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [
      {
        _tag: "required-module",
        target: {
          kind: "workspace",
          name: "root",
        },
        moduleId: "workspace-quality-biome",
      },
    ],
    contributions: [
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "lint",
        value: "biome lint",
      },
    ],
  },
  {
    id: "workspace-quality-biome-format",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Biome",
    description: "Fast formatter with recommended defaults",
    visibility: "internal",
    categories: ["format"],
    conflictsWith: ["workspace-quality-dprint", "workspace-quality-oxfmt"],
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [
      {
        _tag: "required-module",
        target: {
          kind: "workspace",
          name: "root",
        },
        moduleId: "workspace-quality-biome",
      },
    ],
    contributions: [
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "format",
        value: "biome check --write",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "format:check",
        value: "biome check",
      },
    ],
  },
  {
    id: "workspace-quality-oxfmt",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Oxfmt",
    description: "High-performance formatter for the JavaScript ecosystem",
    visibility: "internal",
    categories: ["format"],
    conflictsWith: [
      "workspace-quality-biome-format",
      "workspace-quality-dprint",
    ],
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [
      {
        _tag: "required-target",
        identity: {
          kind: "workspace",
          name: "root",
        },
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/.oxfmtrc.jsonc",
        contents: template("./workspace-quality-oxfmt/_oxfmtrc.jsonc"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/.vscode/settings.json",
        contents: template("./workspace-quality-biome/.vscode/settings.json"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/.vscode/extensions.json",
        contents: template("./workspace-quality-oxfmt/.vscode/extensions.json"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "oxfmt",
        value: "^0.65.0",
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
    id: "workspace-quality-dprint",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "dprint",
    description: "Fast pluggable formatter used by the Effect team",
    visibility: "internal",
    categories: ["format"],
    conflictsWith: [
      "workspace-quality-biome-format",
      "workspace-quality-oxfmt",
    ],
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [
      {
        _tag: "required-target",
        identity: {
          kind: "workspace",
          name: "root",
        },
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/dprint.json",
        contents: template("./workspace-quality-dprint/dprint.json"),
      },
      {
        _tag: "file",
        path: "{{targetPath}}/.vscode/settings.json",
        contents: template("./workspace-quality-biome/.vscode/settings.json"),
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
    id: "workspace-quality-oxlint",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "oxlint",
    description: "Fast Rust-based linter used by the Effect team",
    visibility: "internal",
    categories: ["lint"],
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [
      {
        _tag: "required-target",
        identity: {
          kind: "workspace",
          name: "root",
        },
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{#if standaloneOxlint}}{{targetPath}}/.oxlintrc.json{{/if}}",
        contents: template("./workspace-quality-oxlint/_oxlintrc.json"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "oxlint",
        value: "1.80.0",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "{{#if effectOxlint}}oxlint-tsgolint{{/if}}",
        value: "7.0.2001",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "lint",
        value:
          "{{#if monorepo=vite-plus}}vp lint{{/if}}{{#if standaloneOxlint}}oxlint{{/if}}",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "lint:fix",
        value:
          "{{#if monorepo=vite-plus}}vp lint --fix{{/if}}{{#if standaloneOxlint}}oxlint --fix{{/if}}",
      },
    ],
  },
  {
    id: "workspace-test-vitest",
    supportedRuntimes: ["bun", "node", "deno"],
    title: "Vitest",
    description: "Unit and integration testing framework",
    visibility: "internal",
    categories: ["test"],
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [
      {
        _tag: "required-target",
        identity: {
          kind: "workspace",
          name: "root",
        },
      },
    ],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/vitest.config.ts",
        contents: template("./workspace-test-vitest/vitest.config.ts"),
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "vitest",
        value: "^4.1.11",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "{{#if runtime=bun}}test{{/if}}{{#if runtime=node}}test{{/if}}",
        value:
          "{{#if monorepo=turbo}}turbo run test{{/if}}{{#if monorepo=vite-plus}}vp run -r test{{/if}}{{#if monorepo=nx}}nx run-many -t test{{/if}}",
      },
    ],
  },
  gitInitModule,
  nixFlakeModule,
  devcontainerModule,
  huskyModule,
]);
