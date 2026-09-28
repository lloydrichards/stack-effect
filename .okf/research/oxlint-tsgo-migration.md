---
type: Research Report
title: Oxlint and Oxfmt with Effect tsgo
description: Dated migration rationale and compatibility research for the repository tooling change.
status: draft
sources:
  - id: root
    resource: ../../package.json
    title: Current root tooling scripts and dependencies
  - id: docs
    resource: ../../apps/docs/package.json
    title: Docs tooling scripts
  - id: catalog-modules
    resource: ../../catalogs/official/src/modules/init.ts
    title: Generated lint and format module definitions
  - id: catalog-content
    resource: ../../catalogs/official/templates/workspace-quality-oxlint/_oxlintrc.json
    title: Generated lint configuration template
---

# Oxlint and Oxfmt with Effect tsgo: migration research

Status: implemented in the root repository, 2026-09-27. Generated project choices remain separate.

This is the research captured before migration. Version ranges, commands, and the "Current repo facts" section describe that earlier checkout and need rechecking before reuse.

## Recommended shape

Use Oxlint for lint diagnostics and Oxfmt for formatting. Both belong to Oxc and use its VS Code extension, although they remain separate binaries and config files. The installed `@effect/tsgo@0.46.1` lists TypeScript `7.0.2`, Oxlint `1.82.0`–`1.85.0`, and `oxlint-tsgolint` `7.0.2001`–`7.0.2003` as supported. Pin compatible Oxlint and tsgolint versions, add Oxfmt, then change the root prepare script from `effect-tsgo patch --typescript --no-oxlint` to `effect-tsgo patch --typescript --oxlint`. The patch command checks versions before changing integrations. [Effect setup](https://github.com/Effect-TS/tsgo/blob/main/docs/README.md); [package README](https://github.com/Effect-TS/tsgo/blob/main/_packages/tsgo/README.md); [Oxfmt editor setup](https://oxc.rs/docs/guide/usage/formatter/editors).

Use a root `.oxlintrc.json` with `@effect/tsgo`'s schema and recommended preset. Its shipped preset already enables `options.typeAware: true`, the `effecttsgo` plugin, and recommended Effect rules. Start with:

```json
{
  "$schema": "./node_modules/@effect/tsgo/oxlint-schema.json",
  "extends": ["./node_modules/@effect/tsgo/oxlint-presets/recommended.json"]
}
```

The preset has many warnings; `options.denyWarnings: true` would make them fail CI, so choose that deliberately after reviewing the baseline. The package offers narrower `correctness`, `antipattern`, `effect-native`, and `style` presets and rule overrides. [Effect setup](https://github.com/Effect-TS/tsgo/blob/main/docs/README.md); [Oxlint config reference](https://oxc.rs/docs/guide/usage/linter/config-file-reference).

Set the root `lint` script to `oxlint .`, `format` to `oxfmt .`, and `format:check` to `oxfmt --check .`; update `apps/docs`'s own `lint` script if Turbo invokes it. Use a root `.oxfmtrc.jsonc` with double quotes, spaces, semicolons, and the current desired line width. Oxfmt supports the repo's TypeScript, TSX, JSON/JSONC, CSS, GraphQL, Markdown, MDX, and HTML paths. Its Markdown, MDX, and HTML support currently uses a bundled Prettier implementation in the npm package. Compare the formatting diff before applying it repo-wide. [Oxfmt config](https://oxc.rs/docs/guide/usage/formatter/config); [Oxfmt language support](https://oxc.rs/docs/guide/usage/formatter/language-support); [Oxfmt CLI](https://oxc.rs/docs/guide/usage/formatter/cli).

Decide import sorting explicitly. Oxfmt's `sortImports` is disabled by default, and the CLI's generated `.oxfmtrc.jsonc` also sets it to `false`. Biome currently organizes imports on save and through `biome check`. To retain an import-order gate under Oxc, enable Oxfmt `sortImports` after inspecting its ordering changes; otherwise record that import organization is being dropped. Keep `sortPackageJson: false` initially to avoid unrelated package-manifest reordering. [Oxfmt config](https://oxc.rs/docs/guide/usage/formatter/config); [Oxfmt sorting](https://oxc.rs/docs/guide/usage/formatter/sorting).

For VS Code, recommend `oxc.oxc-vscode` and make it the default formatter. The extension uses project-local `oxlint --lsp` for lint diagnostics and `oxfmt --lsp` for formatting. Retain the existing tsgo editor settings; remove Biome formatter and fix-on-save settings when the new tools are validated. Use `source.fixAll.oxc` if desired. With the Effect LSP enabled, set its plugin's `diagnostics` option to `false` to avoid duplicate Effect reports from tsgo and Oxlint. Verify whether that affects the existing `type-check` gate before applying it globally. [Oxlint editors](https://oxc.rs/docs/guide/usage/linter/editors); [Oxfmt editors](https://oxc.rs/docs/guide/usage/formatter/editors); [Effect setup](https://github.com/Effect-TS/tsgo/blob/main/docs/README.md).

## Checks before switching gates

- Run the root and docs lint commands and compare the current Biome baseline with Oxlint findings. Rule coverage and defaults differ; this is a policy migration, not a command rename.
- Keep `bun run type-check` separate initially. Oxlint's `options.typeCheck` is experimental and can report compiler diagnostics, but there is no need to replace the current Turbo package type checks in the first migration. [Oxlint type-aware guide](https://oxc.rs/docs/guide/usage/linter/type-aware).
- For type-aware monorepo linting, install dependencies and build packages whose consumers need declaration files. Oxlint discovers each file's tsconfig; its `--tsconfig` option does not control type-aware linting. [Oxlint type-aware guide](https://oxc.rs/docs/guide/usage/linter/type-aware); [Oxlint CLI](https://oxc.rs/docs/guide/usage/linter/cli).
- Check ignored generated directories and the formatter's actual file coverage. Oxlint covers JavaScript/TypeScript; Oxfmt also handles styles, data files, and docs, with some formats delegated to bundled Prettier. Prefer a root config; Oxlint's `options.typeAware` is root-only, and nested configs can be introduced later for package-specific rules. [Oxlint configuration](https://oxc.rs/docs/guide/usage/linter/config); [Oxfmt language support](https://oxc.rs/docs/guide/usage/formatter/language-support).

## Current repo facts

Root `lint` is `biome lint .`; `format` and `format:check` use `biome check`; `apps/docs` also has `biome lint .`. Root prepare explicitly excludes Oxlint. The repo already uses TypeScript `7.0.2`, `@effect/tsgo@0.46.1`, and VS Code tsgo. These observations are from the current checkout's `package.json`, `apps/docs/package.json`, `biome.jsonc`, `.vscode/settings.json`, and installed `node_modules/@effect/tsgo/README.md`.

The local CLI confirms the intended tool split. I ran `stack-effect create oxlint-research --target package/domain:domain-api-contracts --typescript 7 --monorepo turbo --lint oxlint --format oxfmt --yes --dry-run --show-files --no-git` against a temporary root, then removed that root. The preview emitted `.oxlintrc.json`, `.oxfmtrc.jsonc`, `lint: oxlint`, `format: oxfmt`, `format:check: oxfmt --check`, `prepare: effect-tsgo patch --oxlint`, and an Oxc editor extension recommendation. It selected `oxfmt@^0.65.0`, `oxlint@1.80.0`, `oxlint-tsgolint@7.0.2001`, and `@effect/tsgo@0.38.0`; these are the catalog's generated-project versions, not the versions already installed in this repository. The installed `@effect/tsgo@0.46.1` supports Oxlint `1.82.0`–`1.85.0`, so do not copy the CLI's Oxlint version into this root migration. The local catalog definitions and generated content are listed in the sources above. [Package compatibility table](https://github.com/Effect-TS/tsgo/blob/main/_packages/tsgo/README.md).

Oxlint's VS Code extension runs Oxlint's LSP. Effect tsgo remains the TypeScript language server; the Oxlint patch connects its type-aware lint engine to Effect tsgo. They are two editor integrations serving different diagnostics. To avoid duplicate Effect diagnostics, upstream recommends disabling `@effect/language-service` diagnostics in the tsgo plugin once Oxlint has become the authoritative Effect lint gate. Keep the current type-check gate until that change has been verified. [Effect Oxlint setup](https://github.com/Effect-TS/tsgo/blob/main/docs/README.md); [Effect tsgo README](https://github.com/Effect-TS/tsgo/blob/main/_packages/tsgo/README.md).
