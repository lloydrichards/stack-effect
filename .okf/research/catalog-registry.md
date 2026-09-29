---
type: Research Report
title: HTTP catalog registry
description: Dated measurements, distribution alternatives, and registry precedents behind the catalog distribution and source selection decisions.
status: deprecated
sources:
  - id: catalog
    resource: ../../packages/domain/src/Catalog.ts
  - id: service
    resource: ../../packages/catalog/src/CatalogService.ts
  - id: community
    resource: https://github.com/lloydrichards/stack-effect/issues/249
generated: { by: claude, at: "2026-09-29T18:00:00+02:00" }
---

# HTTP catalog registry research

Superseded by the [catalog distribution decision](../architecture/catalog-distribution.md "superseded by") and the [catalog source selection decision](../architecture/catalog-source-selection.md "superseded by"). Use those decisions for current behavior. This report keeps the dated measurements, the alternatives it compared, and the evidence from shadcn, OCI, and VFS.

"CDN registry" is interpreted here as the shadcn-style JSON registry pattern. The comparison covers static HTTP, split assets, npm through a CDN, OCI artifacts, and VFS snapshots.

## The catalog model fits JSON

The catalog holds target and module definitions, dependencies, compatibility rules, template strings, and six tagged contribution types. Loading the full definitions preserves composition and unresolved configuration tokens. The smaller `CatalogTree` and `BuilderCatalog` projections omit generation data and cannot serve as the downloadable catalog. [Definition contracts](https://github.com/lloydrichards/stack-effect/blob/375c27c8568f07d44c5ba4c095e31dc60ff9bc38/packages/domain/src/Catalog.ts), [catalog projections](https://github.com/lloydrichards/stack-effect/blob/375c27c8568f07d44c5ba4c095e31dc60ff9bc38/packages/catalog/src/CatalogService.ts).

A local probe encoded `{ targets: targetRegistry, modules: moduleRegistry }` through `Schema.fromJsonString(Schema.Struct(...))`, using arrays of `TargetDefinition` and `ModuleDefinition`. Decoding and encoding again produced identical bytes. All 62 dependency target identities regained callable `toKey()` methods. Plain `JSON.parse` alone would lose that schema-class behavior.

| Local measurement | Result |
| --- | ---: |
| Targets / modules | 7 / 71 |
| JSON, UTF-8 bytes | 352,696 |
| gzip, Node zlib defaults | 63,814 |
| Brotli, Node zlib defaults | 51,319 |
| Definition-level Finalize scripts | 4 |
| Contribution kinds represented | 6 |

Measured on 2026-09-27 at Stack Effect commit `375c27c8568f07d44c5ba4c095e31dc60ff9bc38`. The probe used `Schema.encodeSync`, `Schema.decodeUnknownSync`, `gzipSync`, and `brotliCompressSync`. Sizes exclude the document envelope and HTTP headers. The probe proves serialization feasibility, not HTTP latency, browser memory, or CLI and browser generation parity. About 64 KB compressed was a strong reason to try one download before adding per-module fetching.

## Distribution choices and their costs

These are engineering judgments informed by the cited formats. No transport performance comparison was run.

| Direction | Benefit | Main cost | Outcome |
| --- | --- | --- | --- |
| One JSON document with inline text | One consistent download; easy inspection and static hosting | Fetches the entire catalog; mutable content can change output over time | Selected as the mutable v1 channel |
| JSON index plus module or file assets | Fetch selected payloads; cache shared files | Dependency hydration, more requests, partial failures | Add if measured growth warrants it |
| JSON plus a VFS snapshot | Filesystem metadata and binary payload support | Codec coupling; still needs semantic definitions | Optional artifact or cache experiment |
| Data package on npm through a CDN | Existing release tooling and HTTP file access | Additional publication dependency | Alternative host for the same JSON |
| OCI artifact | Digest-addressed manifests and blobs | More registry and authentication machinery | Revisit for private artifact infrastructure |
| Exact content pins and an immutable release archive | Stronger fresh-clone reproduction | Archive retention and update management | Not selected |

[UNPKG](https://unpkg.com/) supports exact-version package file URLs. Use those to fetch a data file, not to import remote JavaScript. [OCI artifact concepts](https://oras.land/docs/concepts/artifact/) provide content-addressed distribution, but that machinery is unnecessary for a static docs host.

shadcn is the closest precedent. Its build command emits registry item JSON under `public/r`, and its project configuration maps namespace aliases to registry URLs. Registry items distinguish package dependencies from registry dependencies. Stack Effect borrows that publishing and lookup pattern while keeping its own contribution and dependency model. Adapting shadcn items into Stack Effect modules would be a separate feature. [Registry publishing](https://ui.shadcn.com/docs/registry/getting-started), [namespaces](https://ui.shadcn.com/docs/registry/namespace), [item schema](https://ui.shadcn.com/docs/registry/registry-item-json).

JSON is the document format. A browser `Blob` is a byte container, and base64 is an encoding. Neither supplies catalog identity, compatibility, or composition rules. Keep text as text and use HTTP compression. A future binary-asset requirement can add digest-addressed files without redesigning module semantics.

## Hosting constraints

Vite copies public assets unchanged and serves them from the root, so the hosted path is `/registry/...`, not `/public/registry/...`. [Vite public directory](https://vite.dev/guide/assets#the-public-directory). Mutable documents need revalidation caching. [HTTP cache directives](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control). Browsers can fetch catalogs on other origins only when the host allows CORS. Hosts must also send JSON content types, support HTTPS, and return real 404 responses instead of an SPA fallback page. [Browser CORS behavior](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

## VFS fits the output side

Stack Effect uses `@effect-vfs/memory` in `ApplyWorkspaceService` for isolated Plan and Apply previews. A registry could later carry literal file assets as a snapshot, but it must still carry declarative operations. Two modules contributing cards to the same JSX slot cannot be replaced by two independently rendered whole-file snapshots without a separate merge policy. [Workspace service](https://github.com/lloydrichards/stack-effect/blob/375c27c8568f07d44c5ba4c095e31dc60ff9bc38/packages/scaffold/src/service/apply/ApplyWorkspaceService.ts), [compiled profile research](compiled-catalog-profiles.md "separates declarations from compiled output").

VFS snapshots use newline-delimited JSON with base64 names and payloads. They support bounded streaming decode, including byte, record, entry, and line limits. A file occupies one line. This is useful filesystem transport, but it is not automatically a smaller catalog representation. [Snapshot codec](https://github.com/lloydrichards/effect-virtual-fs/blob/bef367506417d0c024ac490d3b4735da4ac93ccf/packages/core/src/VirtualFileSystem.ts#L1651-L1668), [decode limits](https://github.com/lloydrichards/effect-virtual-fs/blob/bef367506417d0c024ac490d3b4735da4ac93ccf/packages/core/src/Snapshot.ts#L83-L106).

The persistence changelog records an incompatible byte-format change while the header remained `version: 1`. A public registry should own its protocol version. If it later wraps VFS payloads, it must specify codec compatibility and keep fixtures from earlier releases. [Recorded format break](https://github.com/lloydrichards/effect-virtual-fs/blob/bef367506417d0c024ac490d3b4735da4ac93ccf/packages/persistence/CHANGELOG.md#L41-L55).

## Evidence boundaries

The research inspected source at the commit above, repository issue bodies, registry and hosting documentation, and the adjacent VFS checkout. The serialization round trip passed. The report measured no network performance, hosting-provider headers, or CLI and browser parity; the distribution decision records the qualification that followed.
