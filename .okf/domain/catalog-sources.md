---
type: Contract
title: Catalog sources and documents
description: Domain definitions and invariants for catalog sources, v1 catalog documents, composition issues, and loaded-source identity.
status: stable
sources:
  - id: source-contract
    resource: ../../packages/domain/src/CatalogSource.ts
  - id: document-contract
    resource: ../../packages/domain/src/Catalog.ts
  - id: config
    resource: ../../packages/domain/src/Scaffold.ts
  - id: compose
    resource: ../../packages/catalog/src/composeCatalog.ts
  - id: loader
    resource: ../../packages/scaffold/src/service/catalog/CatalogLoader.ts
generated: { by: claude, at: "2026-09-29T18:00:00+02:00" }
---

# Catalog sources and documents

## CatalogSource

Definition:
One named place a catalog document is loaded from. A source is either the official source or a custom source.

Invariants:

- The name `official` is reserved (`OFFICIAL_CATALOG_SOURCE`). Its entry takes no `url`; the application supplies the official URL.
- A custom source has a `CatalogSourceName` and a `CatalogSourceUrl`.
- A `CatalogSourceName` matches `^[a-z][a-z0-9-]{0,31}$` and is never `official`.
- A `CatalogSourceUrl` is absolute `https:`, or `http:` on a loopback host. It has no credentials and no fragment.
- A source name records provenance only. It never appears in recipe strings, target kinds, module IDs, or output paths, and it grants no precedence.

Connected terms:

- `CatalogSources`, `CatalogDocument`, `StackConfig`

In code:

- `CatalogSource`, `OfficialCatalogSource`, `CustomCatalogSource`, `CatalogSourceName`, `CatalogSourceUrl`, `OFFICIAL_CATALOG_SOURCE`, `OFFICIAL_CATALOG_URL`

## CatalogSources

Definition:
The explicit, non-empty set of sources one operation loads, saved as `StackConfig.catalogs`.

Invariants:

- The list is non-empty. A repeated name, or one URL under two names, is invalid.
- An absent `catalogs` field means the official source alone (`defaultCatalogSources`). An empty list never means that.
- Order carries no meaning for composition. Two selections are the same when they contain the same sources.

Connected terms:

- `CatalogSource`, `StackConfig`

In code:

- `CatalogSources`, `defaultCatalogSources`, `sameCatalogSources`, `selectsOfficialCatalog`, `isCustomCatalogSource`

## CatalogDocument

Definition:
The v1 JSON document that one source serves: a catalog identity, protocol fields, and its target and module definitions.

Invariants:

- `formatVersion` is `1`.
- `catalogId` is a non-empty string that names the document. The official document uses `OFFICIAL_CATALOG_ID` (`stack-effect-official`). A `catalogId` is distinct from the source name a project selects it under, and it grants no trust.
- `requiredCapabilities` lists the interpreter capabilities the document uses. A capability outside the v1 set, or used without being declared, is a `CatalogCapabilityError`.
- `requires` is optional. In v1 its only accepted value is `["official"]`. It declares a dependency on the official source. It is not an interpreter capability.
- Decoding rejects unknown top-level fields.

Connected terms:

- `CatalogFragment`, `CatalogSource`, `TargetDefinition`, `ModuleDefinition`

In code:

- `CatalogDocument`, `OFFICIAL_CATALOG_ID`, `CatalogCapabilityError`

## CatalogFragment and composed catalog

Definition:
A `CatalogFragment` is a set of target and module definitions. The composed catalog is the union of every selected document's fragment, validated as one catalog.

Invariants:

- Each fragment is decoded on its own before any reference is resolved.
- Composition rejects a target kind or module ID that two fragments define. Collisions are errors; there is no override order.
- References, ownership, capabilities, children, and conflicts are validated against the union.
- A definition may reference another source's definitions only when its document declares that source in `requires`.

Connected terms:

- `CatalogDocument`, `CatalogIssueCode`, `Source provenance`

In code:

- `CatalogFragment`, `composeCatalog`, `CatalogService.fromFragments`

## Source provenance

Definition:
The record of which selected source supplied each target and module in a composed catalog.

Invariants:

- Composition records provenance only when fragments come from named sources.
- Each Finalize script carries its source name. The source is part of the script's identity, so a custom script never replaces an official one.

Connected terms:

- `CatalogSource`, `CatalogFragment`, `FinalizeReport`

In code:

- `CatalogService.getSource`, the `source` field on scripts from `FinalizeService.preview`

## CatalogIssueCode

Definition:
The reason code on each `CatalogIssue` that composition or validation reports.

Invariants:

- `invalid-shape`, `duplicate-id`, `missing-reference`, `unsupported-target`, `unavailable-capability`, and `asymmetric-conflict` apply to any catalog.
- `finalize-script` marks a Finalize script in a fragment that may not contribute one.
- `undeclared-reference` marks a reference into another source that its document does not declare in `requires`.
- `missing-source` marks a `requires` entry whose source is not selected. Composition checks it before any reference.
- `cross-source-conflict` marks a `conflictsWith` entry that names another source's module. Conflicts stay within one source.
- Each issue names a subject: a module, a target, or the document.

Connected terms:

- `CatalogFragment`, `CatalogValidationError`

In code:

- `CatalogIssueCode`, `CatalogIssue`, `CatalogIssueSubject`, `CatalogValidationError`

## Digest and freshness

Definition:
The identity and age of the document one source supplied to an operation.

Invariants:

- The digest is the SHA-256 hash of the loaded bytes, in hex. It identifies content and detects cache corruption. It does not authenticate the publisher or pin content.
- Freshness is `current` when the source served or revalidated the document during this operation, and `cached` when a transient failure fell back to the last validated cache entry.
- Each selected source has its own digest and freshness.

Connected terms:

- `CatalogSource`, `CatalogDocument`

In code:

- `LoadedCatalogSource`, `CatalogCacheEntry` in `@repo/scaffold`

See [catalog loading](../architecture/catalog-loading.md "implements these contracts") and the [source selection decision](../architecture/catalog-source-selection.md "sets the policy for these contracts").
