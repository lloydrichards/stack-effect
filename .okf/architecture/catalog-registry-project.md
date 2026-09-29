---
type: Decision
title: Catalog registry project
description: Accepted shape of the author catalog and the standalone catalog registry project it generates.
status: stable
sources:
  - id: issue
    resource: https://github.com/lloydrichards/stack-effect/issues/297
  - id: targets
    resource: ../../catalogs/author/src/targets.ts
  - id: modules
    resource: ../../catalogs/author/src/modules.ts
  - id: e2e
    resource: ../../apps/cli/e2e/registry-project.test.ts
  - id: selection
    resource: catalog-source-selection.md
  - id: escape
    resource: https://github.com/lloydrichards/stack-effect/issues/304
generated: { by: claude, at: "2026-09-29T13:30:00+02:00" }
---

# Catalog registry project

Status: Implemented. Issue #297 owns the generated project. Issue #298 owns hosting `author.json` and the deployed create path.

## Keep the author catalog separate from the official catalog

`catalogs/author` defines the author catalog with `@repo/authoring`, like `catalogs/official`. Its build writes `dist/registry/v1/author.json`. Adding its definitions to the official catalog would change the official document and offer an authoring target in every project.

The author catalog declares `requires: ["official"]` and defines no `workspace` target. The registry project uses the official workspace: its tooling, TypeScript config, and Finalize steps. Its files depend on that workspace, for example by extending `@repo/config-typescript/base.json`. Declaring the dependency makes a custom-only selection fail with the named `requires` error instead of creating a broken project. Consumers select `--catalog official --catalog author=<url>`.

## Split tooling from the example

- The `catalog` target (default name `registry`, so `apps/catalog-registry`) contributes the tooling. This covers `package.json`, `tsconfig.json`, the README, `catalog/index.ts`, and the `build`, `validate`, and `preview` scripts. It supports Bun and Node. The end-to-end test covers Bun. Node with npm, pnpm, turbo, and nx was checked by hand.
- The required `catalog-starter` module contributes the example definitions and template files. It adds its definition groups to `catalog/index.ts` through `ts-call-arg` on `Array.of`, so later modules can add their own groups the same way.
- The generated catalog is standalone. It supplies its own `workspace` target, an `app` target, and one module with one plain template file. Its `catalogId` is the project name, and its build writes `dist/registry/v1/catalog.json`.

## Depend only on published packages

The registry project depends on `@stack-effect/author` and `stack-effect` with `~` ranges, because pre-1.0 minor versions may break. The `effect` pins equal the author package's `effect` peer. A test in `catalogs/author` enforces the pins, though not the `~` ranges, and a boundary test allows no other `@repo/` reference than the generated workspace's own `@repo/config-typescript`.

## Preview through the CLI

The package exposes no preview API. `preview <target>/<name>:<module>` builds the catalog and serves it on a free `127.0.0.1` port as `application/json`, with no validators. It then runs `stack-effect create --dry-run --show-files` with only that source and an empty `XDG_CACHE_HOME`, and fails if the CLI reports cached data. The preview is custom-only, because a standalone catalog cannot compose with the official one. Both define `workspace`.

## Keep template files out of workspace tools

The build embeds each template file byte for byte. If a formatter or linter rewrote `templates/`, the published document would change without an edit. The target adds a nested config for each tool:

| Tool | Mechanism |
| --- | --- |
| oxfmt | `.oxfmtrc.jsonc` repeating the workspace options, because the nearest config replaces rather than merges |
| oxlint and `vp lint` | `.eslintignore` |
| biome | `biome.jsonc` with `root: false` and `extends: "//"` |
| dprint | `dprint.json` repeating the workspace config, because `extends` rejects the inherited `includes` |
| TypeScript | `include: ["catalog", "scripts"]` |

Tests keep the repeated oxfmt and dprint configs equal to the official ones. The end-to-end test checks that a format run between two builds leaves the document identical.

## Build token text at runtime

Stack Effect resolves every known token in every file it creates, including the registry project's own definitions. v1 has no escape syntax (#304). Literal token text in the starter would therefore be resolved against the author's project and bake wrong paths into their catalog. The starter builds token text in `catalog/tokens.ts` from repeated single braces. Its template files contain no tokens. Any file that needs a token, such as the app's `package.json` with its package name, is written in the definition instead of a template file. The same limit rejects other double-brace text in templates, such as JSX style objects. Remove the helper once #304 accepts an escape.

## Alternatives not selected

- A standalone author catalog with its own workspace. It could not be selected with the official catalog, and authors would lose the official tooling.
- A preview export in `@stack-effect/author`. It would bundle `@repo/scaffold` into the public package and could drift from CLI behavior.
- Hardcoded paths instead of tokens in the starter. They teach the wrong pattern and break when a consumer names the target.
