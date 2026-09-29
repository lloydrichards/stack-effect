---
okf_version: "0.2"
---

# Stack Effect knowledge

- [Domain vocabulary](domain/index.md) defines canonical terms and invariants.
- [Architecture](architecture/index.md) describes current ownership and behavior.
- [Authoring guides](guides/index.md) explain how to extend the catalog.
- [Research](research/index.md) records investigations, alternatives, and their evidence.

Start with the [scaffold lifecycle](architecture/scaffold-lifecycle.md). The [repository state decision](architecture/plan-apply-repository-state.md) describes the implemented Plan to Apply handoff. The [catalog distribution decision](architecture/catalog-distribution.md) describes the implemented official source. The [source selection decision](architecture/catalog-source-selection.md) defines community-source configuration, which is not yet implemented. Other research proposals remain drafts. The dated VFS report describes the revision it inspected; use the focused concepts for current guidance.

Validate with `bunx okf-graph@0.3.0 validate .okf --json`.
