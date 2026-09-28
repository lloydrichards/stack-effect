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
  this. The package still ships raw TypeScript with extensionless imports, so
  it loads under Bun, Deno and bundler resolvers such as Vitest, but not plain
  `node`; a built, installable package belongs to #293.
- Every definition source and template must be a file URL or absolute path
  inside the build `root`, so reported paths and provenance are the same on
  every machine.
- Catalog source selection and trust policy stay in the CLI and loaders.
  `finalizeScripts: "allow"` only lets a build emit scripts; loaders decide
  whether to run them.
- Provenance is returned beside the document and never written into it.

## Fixture

`test/fixtures/standalone` is the external-author proof. It may import only
`@repo/authoring`, `effect` and `@effect/platform-*`, which
`src/fixtureBoundary.test.ts` checks. Its templates and golden JSON are
excluded from formatting and line-ending conversion because their bytes are
embedded verbatim; regenerate the golden file only for intended output changes.
