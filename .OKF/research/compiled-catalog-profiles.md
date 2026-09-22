---
type: Research Report
title: Compiled catalog profiles
description: Proposed relationship between declarative catalog fragments and generated snapshot artifacts.
status: draft
sources:
  - id: exploration
    resource: https://github.com/lloydrichards/stack-effect/issues/254
    title: Compiled profile and cache identity exploration
  - id: catalog
    resource: ../../packages/domain/src/Catalog.ts
    title: Declarative contribution contracts
  - id: modules
    resource: ../../packages/catalog/src/registry/modules/client.ts
    title: Shared JSX slot contributions
  - id: inputs
    resource: ../../packages/domain/src/Scaffold.ts
    title: Rendering input dimensions
  - id: community
    resource: https://github.com/lloydrichards/stack-effect/issues/249
    title: Community Catalog foundation
  - id: report
    resource: ../../.docs/reports/2026-09-22-effect-vfs-design-research.md
    title: Catalog alternatives and evidence
generated: { by: codex, at: "2026-09-22T19:00:00+02:00" }
---

# Compiled catalog profiles

Keep declarative fragments authoritative. Snapshots may carry literal assets or compiled examples, but cannot replace semantic module operations.

Two client modules contribute different cards to the same `app.tsx` slot. Independently generated whole-file snapshots lose the intent to retain both edits. JSON dependency entries and shared TypeScript composition have the same constraint. A one-base VFS overlay is not a multi-module merge.

Prefer named profiles and generation on demand over every possible variation. Project names, target paths, and configuration remain open-ended inputs. A cache must account for all output-affecting inputs and retain the declarative recipe needed to regenerate results.

Investigate whether one concrete consumer benefits from compiled profiles. Compare generation cost with snapshot decode cost, payload size, and memory. Include catalog identity, normalized inputs, composer version, and generation stage in the proposed cache identity. Preserve multiple contributors per path.

This extends the [artifact discussion](generated-artifacts.md "depends on completeness") and #249 without adding remote discovery, executable fragment hooks, or a marketplace to the initial fragment contract.

## Open outcome

Choose one profile, show a reproducible round trip, and demonstrate invalidation when catalog or configuration changes. Adopt caching only if measurements justify the extra identity and storage machinery.
