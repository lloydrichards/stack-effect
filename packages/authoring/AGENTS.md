# Authoring Package AGENTS.md

> See root `/AGENTS.md` for monorepo conventions.

## Purpose

Tools for authoring a Catalog outside this repository: define targets and
modules as plain JSON-shaped data, keep generated file bodies in ordinary
template files, and build a deterministic v1 catalog document with located
validation errors and provenance.

## Boundaries

- Depends on `@repo/domain` (contracts) and `@repo/catalog` (composition and
  v1 capability checks). Never import official catalog definitions or apps.
- Portable across Bun, Node and Deno: `src/` must not use `node:*`, `bun`,
  `Bun`, `Deno` or `process`; read files through Effect `FileSystem` and
  `Path`, which callers provide with their platform layer. Oxlint enforces
  this. This workspace package ships raw TypeScript for repository consumers;
  `packages/author` bundles it, with `@repo/catalog` and `@repo/domain`, into
  the published `@stack-effect/author`. Anything exported from `src/index.ts`
  becomes public API there.
- Every definition source and template must be a file URL or absolute path
  inside the build `root`, so reported paths and provenance are the same on
  every machine.
- Catalog source selection and trust policy stay in the CLI and loaders.
  `finalizeScripts: "allow"` only lets a build emit scripts; the CLI decides
  whether to run them (`apps/cli/src/service/ScaffoldPipeline.ts`). It prompts
  interactively; `--yes` runs only official-source scripts, and `--trust` also
  runs custom-source scripts.
- `requires: ["official"]` composes the caller-supplied `official` document
  for validation only. Official definitions never appear in the output, and
  no network access happens inside `buildCatalog`; `loadOfficialCatalog`
  fetches with the caller's `HttpClient`.
- Provenance is returned beside the document and never written into it.

## Fixture

`test/fixtures/standalone` is the external-author proof. It may import only
`@repo/authoring`, `effect` and `@effect/platform-*`, which
`src/fixtureBoundary.test.ts` checks. Its templates and golden JSON are
excluded from formatting and line-ending conversion because their bytes are
embedded verbatim; regenerate the golden file only for intended output changes.
