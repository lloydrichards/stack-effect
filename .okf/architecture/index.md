# Architecture

- [Scaffold lifecycle](scaffold-lifecycle.md) describes service ownership, planning, Apply, previews, and Finalize.
- [Repository state authority](plan-apply-repository-state.md) records the implemented Plan to Apply state contract.
- [Catalog architecture](catalog.md) describes composition, v1 protocol checks, lookup, provenance, and contributions.
- [Catalog loading](catalog-loading.md) describes source resolution, per-source fetching and caching, and the one composed catalog per operation.
- [Catalog authoring package](catalog-authoring-package.md) describes `@repo/authoring` and the published `@stack-effect/author`.
- [Target and module ID naming](catalog-id-semantics.md) records naming conventions for definition IDs, and how they differ from `catalogId` and source names.

- [Catalog distribution and freshness](catalog-distribution.md) records the hosted official source and its freshness policy.
- [Catalog source selection](catalog-source-selection.md) records the named-source model, composition rules, and script consent.
- [Catalog registry project](catalog-registry-project.md) records the author catalog and the standalone registry project it generates.
