---
type: Research Report
title: Compiled catalog profiles
description: Proposed relationship between declarative catalog fragments and generated snapshot artifacts.
status: draft
sources:
  - id: catalog
    resource: ../../packages/domain/src/Catalog.ts
    title: Declarative contribution contracts
  - id: modules
    resource: ../../catalogs/official/src/modules/client.ts
    title: Shared JSX slot contributions
  - id: inputs
    resource: ../../packages/domain/src/Scaffold.ts
    title: Rendering input dimensions
  - id: catalog-architecture
    resource: ../architecture/catalog.md
    title: Catalog composition boundary
  - id: report
    resource: effect-vfs-review.md
    title: Catalog alternatives and evidence
generated: { by: codex, at: "2026-09-27T09:07:55+00:00" }
---

# Compiled catalog profiles

Keep declarative fragments authoritative. Snapshots may carry literal assets or compiled examples, but cannot replace semantic module operations.

Two client modules contribute different cards to the same `app.tsx` slot. Independently generated whole-file snapshots lose the intent to retain both edits. JSON dependency entries and shared TypeScript composition have the same constraint. A one-base VFS overlay is not a multi-module merge.

Prefer named profiles and generation on demand over every possible variation. Project names, target paths, and configuration remain open-ended inputs. A cache must account for all output-affecting inputs and retain the declarative recipe needed to regenerate results.

Investigate whether one concrete consumer benefits from compiled profiles. Compare generation cost with snapshot decode cost, payload size, and memory. Include catalog identity, normalized inputs, composer version, and generation stage in the proposed cache identity. Preserve multiple contributors per path.

This extends the [artifact discussion](generated-artifacts.md "depends on completeness") and preserves the [declarative catalog boundary](../architecture/catalog.md "keeps definitions authoritative"). Remote discovery, executable fragment hooks, and a marketplace are outside the initial fragment contract.

## Open outcome

Choose one profile, show a reproducible round trip, and demonstrate invalidation when catalog or configuration changes. Adopt caching only if measurements justify the extra identity and storage machinery.
