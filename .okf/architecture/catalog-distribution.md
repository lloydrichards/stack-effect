---
type: Decision
title: Catalog distribution and freshness
description: Accepted boundaries for mutable remote catalogs, cached data, configuration schemas, and declarative composition.
status: stable
sources:
  - id: definitions
    resource: ../../packages/domain/src/Catalog.ts
  - id: service
    resource: ../../packages/catalog/src/CatalogService.ts
  - id: config
    resource: ../../packages/domain/src/Scaffold.ts
  - id: schema-export
    resource: ../../apps/cli/src/commands/schema.ts
  - id: research
    resource: ../research/catalog-registry.md
  - id: loader
    resource: https://github.com/lloydrichards/stack-effect/issues/271
  - id: publication
    resource: https://github.com/lloydrichards/stack-effect/issues/272
  - id: composition
    resource: https://github.com/lloydrichards/stack-effect/issues/249
generated: { by: codex, at: "2026-09-27T21:00:00+02:00" }
---

# Catalog distribution and freshness

Status: Accepted direction. Local work for #249 composes and injects validated definitions. Local work for #271 defines the v1 JSON document and a shared HTTP loader with validated cache fallback. Local work for #272 generates the public assets and Vercel rules. Local work for #273 and #274 connects the CLI and Recipe Builder to the loader with user and browser cache adapters. Deployed behavior and cross-client generation parity remain unverified. GitHub issues own implementation scope, sequencing, and acceptance evidence; this document owns the reusable decisions and their consequences.

## Separate content delivery from engine releases

Serve the official catalog as a Stack Effect-owned JSON document at `https://stack-effect.lloydrichards.dev/registry/v1/catalog.json`. The docs origin hosts public assets; `public` is a build-source directory and is not part of the URL.

The v1 path identifies a protocol family, not an immutable content release. New definitions and template fixes may replace the document while preserving existing identifiers and supported interpreter operations. Freeze the v1 capability baseline so adding a module cannot silently make the entire catalog unreadable by older v1 clients. New interpreter semantics require a separate protocol decision.

Do not require catalog semver, a historical-content archive, a catalog lockfile, or a downloaded catalog committed to each project. Older `stack.effect.json` files use the official source as an internal default. A content digest identifies loaded bytes and detects cache corruption; it does not authenticate the publisher or promise that those bytes remain downloadable.

This trades cross-date reproducibility for a simpler publishing and user-update model. The same inputs can produce different output after a template update. Claims of deterministic behavior therefore include the loaded catalog in their inputs.

## Keep one catalog throughout an operation

Load and validate the catalog before catalog-dependent selection, planning, configuration writes, Apply, or Finalize execution. Provide the same decoded catalog throughout a CLI command or Recipe Builder session. Network activity must not independently replace definitions between stages.

Selection remains user intent. Blueprint resolves dependency closure. Plan describes repository-aware outcomes, and Apply executes its intent. Distribution does not change those boundaries. Finalize collects scripts from the same catalog used to plan the operation.

A new command or session attempts current content. A running operation keeps its catalog even if the server changes. Shared recipe links carry choices rather than a frozen catalog; reopening them can produce different output, and unresolved choices must be reported explicitly.

Local authoring and production consumption are separate compositions. Repository authoring uses local definitions so edits are visible before publication. Production clients must not import the authoring catalog through a hidden bundled fallback.

## Use cache fallback for outages, not invalid content

Persist the last validated document per source outside project repositories. Try fetching or revalidating it on subsequent use. Recheck cached integrity and compatibility with the installed engine before accepting it.

When transport or a transient server failure prevents loading current content, use a valid compatible cached document with a visible warning that names its source and last successful validation time. If neither network nor cache supplies a usable document, fail clearly. A cold installation requires internet. Cache eviction can make a later installation effectively cold again.

Malformed successful responses, unsupported protocols/capabilities, and permanent source errors must remain actionable failures. Do not conceal a publication or authorization problem behind stale content. Never overwrite the last good entry with invalid data. Cache age alone does not make a compatible document unusable under the accepted outage policy.

Cache writes must not expose partial documents. A failed persistence attempt after a successful fetch need not invalidate the current operation, but the user must know that later offline reuse may be unavailable. CLI warnings must preserve machine-readable stdout; browser fallback must remain visibly distinguishable from current data.

## Keep editor schemas separate from runtime interpretation

Publish `https://stack-effect.lloydrichards.dev/schemas/v1/stack.effect.schema.json`, generated from the canonical `StackConfig` contract. New configs include optional `$schema` editor metadata, and old configs without it remain valid.

The installed CLI validates using its own domain schema. It does not fetch an arbitrary config `$schema` URL to decide what code to execute or which fields it can interpret. Updating the hosted JSON Schema cannot add runtime behavior to an older CLI.

Do not freeze independently evolving catalog IDs into the configuration schema as exhaustive enums. Validate catalog selections against the loaded catalog. Keep protocol compatibility, editor metadata, content identity, and generated-project runtime compatibility distinct.

## Preserve declarative composition across sources

The official source ships first. Community-source configuration and UX remain a follow-up decision. The shared composition boundary accepts declarative definitions, rejects duplicate target kinds/module IDs, and preserves meaningful declaration order. Validate each source structurally, then validate references and ownership across the complete composed catalog; a fragment may refer to another configured source.

Source aliases provide provenance, not override precedence or executable trust. Do not automatically load additional URLs merely because a downloaded definition mentions them. Keep contributed Finalize scripts disabled initially. Preserve official Finalize approval behavior through explicit trusted application wiring; existing `--trust` is not a publisher-trust setting.

JSON avoids running remote catalog modules during loading, but generated source and package scripts remain executable user output. It is not a sandbox. New contribution operations, arbitrary configuration semantics, custom path rules, executable hooks, and private-source authentication require separate decisions.

## Keep filesystem artifacts separate from catalog meaning

VFS remains useful for isolated generated workspaces, previews, and optional compiled artifacts. A filesystem snapshot does not preserve the intent of independent modules editing the same JSON, TypeScript, or JSX location. Keep semantic contributions authoritative even if a future transport packages literal assets differently.

See [catalog architecture](catalog.md "describes the current composition model"), [distribution research](../research/catalog-registry.md "provides evidence and alternatives"), and [compiled profiles](../research/compiled-catalog-profiles.md "separates generated output from definitions").

## Alternatives not selected

- Exact content pins and immutable release archives provide stronger fresh-clone reproduction, but require ongoing retention and update management.
- Committing downloaded catalogs makes reproduction independent of the host, but adds payloads to every project.
- Always failing during an outage avoids stale content but sacrifices availability despite a usable cache.
- Silently serving stale or bundled definitions obscures which catalog generated the result.
- VFS snapshots as the public catalog protocol couple compatibility to a filesystem codec without replacing semantic definitions.

The initial JSON round-trip supports the transport choice. HTTP deployment behavior and cross-client generation parity still require implementation evidence. Accepted policy must not be presented as already deployed behavior.
