# @stack-effect/docs

## 0.2.2

### Patch Changes

- 1cb5192: Add an optional Husky and lint-staged developer-experience module.

## 0.2.1

### Patch Changes

- 437ed2b: Preserve the selected Bun runtime when restoring Recipe Builder state.

## 0.2.0

### Minor Changes

- 935f120: New projects now default to Bun, TypeScript 7, Vite+, Oxlint, Oxfmt, and Vitest.

  Generated commands omit these choices when they match the defaults. To keep the previous TypeScript 6, Turbo, and Biome stack, pass the corresponding `create` or `init` options explicitly.

  The Recipe Builder uses the same defaults and keeps existing Nx shared links compatible by selecting TypeScript 6, which Nx currently requires.

- 10eec6c: The Recipe Builder can now keep valid selections in the URL and copy a shareable recipe link.

### Patch Changes

- 04e55bb: The Recipe Builder now requires a database provider before enabling SQL-backed modules and identifies which selected modules prevent removing it.
- 898cc16: remove flash when changing the target name through optimistic loading web worker

## 0.1.1

### Patch Changes

- 0111a72: align child modules with correct nesting in target config

## 0.1.0

### Minor Changes

- c37d8de: add landing page with interactive workbench
- ba3a35b: add generated reference docs for cli commands
- 1126a39: add an interactive recipe builder with live scaffold previews
- 6c4d516: Add the initial Stack Effect documentation site.

### Patch Changes

- d431650: use shiki for syntax highlighter of respository explorer
- edf00da: add event analitics to recipe builder
