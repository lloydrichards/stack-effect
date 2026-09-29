---
type: Architecture
title: Catalog authoring package
description: How @repo/authoring builds v1 catalog documents from TypeScript definitions and template files, and how @stack-effect/author publishes it.
status: stable
sources:
  - id: index
    resource: ../../packages/authoring/src/index.ts
  - id: define
    resource: ../../packages/authoring/src/Define.ts
  - id: template
    resource: ../../packages/authoring/src/Template.ts
  - id: build
    resource: ../../packages/authoring/src/buildCatalog.ts
  - id: official
    resource: ../../packages/authoring/src/official.ts
  - id: package
    resource: ../../packages/author/package.json
  - id: bundle
    resource: ../../packages/author/tsdown.config.ts
  - id: verify
    resource: ../../packages/author/scripts/verify-package.ts
generated: { by: claude, at: "2026-09-29T18:00:00+02:00" }
---

# Catalog authoring package

`@repo/authoring` turns TypeScript definitions and template files into a v1 [catalog document](../domain/catalog-sources.md "produces this document"). `catalogs/official` and `catalogs/author` use it, and so do external catalogs through the published `@stack-effect/author` package.

## Define definitions and templates

- `defineTargets(import.meta.url, [...])` and `defineModules(import.meta.url, [...])` group definitions in their JSON shape. Each group records its source file, which build errors and provenance name.
- `templates(base)` returns a `template(path)` function. A contribution field may hold a template reference instead of text. The build embeds the referenced file byte for byte.

## Build a document

`buildCatalog(catalog, options)` decodes every definition strictly, resolves templates, composes the result with `composeCatalog`, and checks v1 capabilities. It fails with a `CatalogBuildError` whose issues name their source files and templates.

- `catalogId` names the document, and `root` bounds every source and template path. Reported paths are relative to `root`, so builds are portable.
- `finalizeScripts` defaults to `"reject"`. `"allow"` publishes Finalize scripts; consumers still decide whether to run them.
- `requires: ["official"]` needs the official document as `official`. `loadOfficialCatalog` fetches it. The build composes the official document beside the authored one, so references are checked as the CLI checks them. The official definitions are used only for validation and never appear in the output, which declares `requires: ["official"]`.
- The result holds `json`, the decoded `document`, and `provenance`. Provenance sits beside the document, not inside it: one `DefinitionProvenance` per definition, with its source file and the template behind each template-backed field.

## Publish `@stack-effect/author`

`packages/author` re-exports `@repo/authoring`. tsdown bundles the private `@repo/*` packages into ESM and type declarations, and keeps every `effect` import external. The package declares `effect` as an exact peer, with no range, so authors supply the one runtime version the code was built against. `verify:package` packs the tarball, or with `--registry` uses the published version, and installs it into a clean project with no links into this repository. It then builds a catalog there.

The generated catalog registry project depends on this package with a `~` range, and pins `effect` to the same version as the peer.
