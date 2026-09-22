---
type: Architecture
title: Catalog architecture
description: Read-only definitions, lookup services, and contribution ownership.
status: stable
sources:
  - id: source-1
    resource: ../../packages/catalog/src/CatalogService.ts
  - id: source-2
    resource: ../../packages/catalog/src/registry/targetRegistry.ts
  - id: source-3
    resource: ../../packages/catalog/src/registry/moduleRegistry.ts
  - id: source-4
    resource: ../../packages/domain/src/Catalog.ts
generated: { by: codex, at: "2026-09-22T17:40:50+00:00" }
---

# Catalog architecture

`@repo/catalog` owns read-only target and module definitions. `CatalogService` provides runtime lookup and projections for Blueprint resolution, recipe selection, CLI graphs, and the builder. It does not own mutable generated workspaces.

## Source organization

- `registry/targetRegistry.ts` defines target kinds and base contributions.
- `registry/moduleRegistry.ts` assembles definitions from `registry/modules/`.
- `registry/content/` holds template payloads. Edit their generated files first using the [catalog authoring workflow](../guides/catalog-authoring.md "governs template changes").
- `CatalogService.ts` indexes target kinds, module IDs, and capability providers.

Targets include workspace, package, server, CLI, React, and Foldkit destinations. Treat the registry as the complete list, rather than copying an exhaustive inventory into documentation.

## Lookup and projections

`getTarget` and `getModule` fail with `CatalogNotFound` for unknown identifiers. `isSupportedOn` checks a concrete target identity. `getSupportedModules` filters by target kind and optional visibility, so callers that need exact-identity compatibility must still check the identity.

`getTargetKinds` supports visibility filtering. `getImplications` and `isImpliedByAny` expose implication metadata. `getCapabilityProviders` finds modules that provide a capability on a concrete target. `toBuilderCatalog` projects definitions for selection, while `toGraph` exposes catalog relationships.

Graph nodes are target and module definitions. Edge kinds are `supportedOn`, `requiredModule`, `implies`, and `childOf`. This graph is distinct from the resolved [Blueprint graph](../domain/blueprint-graph.md "instantiates selected definitions").

## Ownership and dependencies

A module contributes only to its owning target. Cross-target effects use tagged dependencies or implications. A client API module can require domain contracts and imply a server counterpart; it cannot directly write into the server target.

`required-target` requires a target identity. `required-module` requires a module attachment and its target. `required-capability` asks for a provider on a target; recipe or selection handling must resolve that provider before Blueprint resolution. `provides`, `conflictsWith`, and categories describe selectable alternatives.

Children organize same-target selection UI. Required children are selected by that UI; they are not a substitute for dependency declarations. Visibility controls presentation, not authorization.

## Contributions

Definitions contain arrays of tagged `Contribution` values. Full files, package JSON entries, barrel exports, call arguments, object fields, and JSX slots remain semantic inputs to planning and composition. Token resolution uses `ContributionTokenContext` and `StackConfig`.

See [contribution contracts](../domain/contributions.md "defines payloads"), [catalog ID naming](catalog-id-semantics.md "guides identifiers"), and [compiled catalog research](../research/compiled-catalog-profiles.md "explores optional snapshots").
