---
type: Architecture
title: Catalog loading
description: How the CLI and Recipe Builder resolve catalog sources, fetch and cache each document, and provide one composed CatalogService per operation.
status: stable
sources:
  - id: loader
    resource: ../../packages/scaffold/src/service/catalog/CatalogLoader.ts
  - id: cache
    resource: ../../packages/scaffold/src/service/catalog/CatalogCache.ts
  - id: file-cache
    resource: ../../apps/cli/src/service/FileCatalogCache.ts
  - id: provider
    resource: ../../apps/cli/src/service/CatalogProvider.ts
  - id: selection
    resource: ../../apps/cli/src/service/CatalogSelection.ts
  - id: cli-sources
    resource: ../../apps/cli/src/lib/catalogSources.ts
  - id: services
    resource: ../../apps/cli/src/services.ts
  - id: runtime
    resource: ../../apps/cli/src/runtime.ts
  - id: worker
    resource: ../../apps/docs/app/workers/recipe-builder/recipe-builder.worker.ts
  - id: browser-cache
    resource: ../../apps/docs/app/workers/recipe-builder/IndexedDbCatalogCache.ts
generated: { by: claude, at: "2026-09-29T18:00:00+02:00" }
---

# Catalog loading

Each CLI command and Recipe Builder session loads its selected catalog sources, composes them once, and uses that one `CatalogService` for every stage. `@repo/catalog` composes and looks up definitions; the loader and its caches live in `@repo/scaffold` and the applications.

## Resolve the source set first

The CLI resolves a `CatalogSelection` before it loads anything. `apps/cli/src/lib/catalogSources.ts` parses `--catalog` flags and reads the saved `catalogs` from `stack.effect.json`. `init` and `create` take the flags as the exact set. Other commands use the saved set and fail when a differing `--catalog` set is passed.

`commandServicesLayer` then asks `CatalogProvider` to load that set. Only after the load succeeds does it build the command's services, with the composed `CatalogService`, the `CatalogSelection` (explicit sources, selected sources, and loaded sources), and the `StackConfigDefaults` that fit the set. A custom-only set gets no official tool defaults.

`CatalogProvider.official` loads through `CatalogLoader` with the production official URL and prints one stderr line per source warning. `CatalogProvider.authoring`, used by the repository's authoring entrypoint, serves the local official definitions and rejects custom sources.

## Load each source

`CatalogLoader.loadSources` loads every selected source concurrently. For each URL it:

- reads the cache entry and accepts it only if its SHA-256 digest matches and it still decodes;
- sends `accept: application/json`, and the cached `If-None-Match` and `If-Modified-Since` validators, with no trace headers;
- enforces a 15-second timeout and an 8 MiB response limit;
- requires a JSON content type, UTF-8 text, `formatVersion` 1, and a valid `CatalogDocument` with supported capabilities.

A `304` response reuses the cached document as `current`. If any source has no usable document, the whole operation fails and reports the first failing source in selection order.

## Fall back only on transient failures

Transport errors, timeouts, and HTTP 408, 429, and 5xx responses are transient. After a transient failure, the loader uses the source's validated cache entry, marks it `cached`, and warns with the source URL and last validation time. Without a cache entry, the operation fails.

Other HTTP statuses, a non-JSON content type, invalid JSON, an invalid document, an unsupported format or capability, and an oversized response are permanent failures. They fail the operation even when a cache entry exists, so stale content never hides a publication problem.

## Compose, then persist

After every source loads, `loadSources` composes all documents once with Finalize scripts allowed and each source's `requires`. Consent to run scripts is a Finalize decision, not a loading one. If composition fails, `CatalogCompositionFailure` names every source with its URL and freshness.

Cache entries are written only after the selection composes, so an entry is never replaced by a document that failed. A failed write adds a `persistence` warning and does not fail the operation. The result is a `LoadedCatalogSet`: the composed `CatalogService` and one `LoadedCatalogSource` per source.

## Cache adapters

`CatalogCache` is the runtime-neutral port: `read(sourceUrl)` and an atomic `write(entry)`. An entry holds the URL, bytes, digest, validators, and validation time. `CatalogCache.memory` serves tests.

- The CLI's `fileCatalogCacheLayer` stores one JSON file per source, named by the SHA-256 hash of its URL, and writes through a temporary file and a rename. Its root is `stack-effect/registry` under `$XDG_CACHE_HOME`, else `~/Library/Caches` on macOS or `~/.cache` elsewhere. On Windows it uses `%LOCALAPPDATA%`.
- The Recipe Builder worker stores entries in the IndexedDB database `stack-effect-catalog`. The worker supplies the same-origin registry URL as the official URL. It keeps one load per session and source set. Script trust comes from source names, never from the worker.

The [distribution decision](catalog-distribution.md "sets the freshness and fallback policy") and the source selection decision record the policy this implements.
