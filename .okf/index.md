---
okf_version: "0.2"
---

# Stack Effect knowledge

- [Domain vocabulary](domain/index.md) defines canonical terms and invariants.
- [Architecture](architecture/index.md) describes current ownership and behavior.
- [Authoring guides](guides/index.md) explain how to extend the catalog.
- [Research](research/index.md) records investigations, alternatives, and their evidence.

Start with the [scaffold lifecycle](architecture/scaffold-lifecycle.md). The [repository state decision](architecture/plan-apply-repository-state.md) describes the implemented Plan to Apply handoff. The [catalog distribution decision](architecture/catalog-distribution.md) describes the hosted official source and its freshness policy. The [source selection decision](architecture/catalog-source-selection.md) describes the implemented model for selecting, composing, and trusting named catalog sources. [Catalog loading](architecture/catalog-loading.md) describes how one composed catalog reaches every stage of an operation. Other research proposals remain drafts. The dated VFS report describes the revision it inspected; use the focused concepts for current guidance.

Validate with `bun run okf:check`, which runs the pinned `okf-graph validate .okf --json`.
