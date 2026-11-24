---
type: Architecture
title: Catalog architecture
description: Catalog composition, v1 protocol checks, read-only lookup, source provenance, and contribution ownership.
status: stable
sources:
  - id: source-1
    resource: ../../packages/catalog/src/CatalogService.ts
  - id: source-2
    resource: ../../catalogs/official/src/targetRegistry.ts
  - id: source-3
    resource: ../../catalogs/official/src/moduleRegistry.ts
  - id: source-4
    resource: ../../packages/domain/src/Catalog.ts
  - id: compose
    resource: ../../packages/catalog/src/composeCatalog.ts
  - id: protocol
    resource: ../../packages/catalog/src/CatalogProtocol.ts
  - id: official-service
    resource: ../../catalogs/official/src/service.ts
  - id: loader
    resource: ../../packages/scaffold/src/Catalog.ts
  - id: preset-discovery
    resource: ../../apps/docs/app/workers/recipe-builder/recipe-builder.worker.ts
  - id: preset-projection
    resource: ../../apps/docs/app/components/recipe-builder/preset-targets.ts
  - id: preset-editor
    resource: ../../apps/docs/app/components/recipe-builder/target-selector/use-target-editor.ts
  - id: provider-resolution
    resource: ../../packages/scaffold/src/internal/recipeResolver.ts
    title: Recipe capability provider resolution
  - id: recipe-errors
    resource: ../../packages/domain/src/Recipe.ts
    title: Provider strategy and provider errors
generated: { by: claude, at: "2026-11-24T00:00:00+00:00" }
---

# Catalog architecture

`@repo/catalog` owns the runtime catalog. It holds three parts:

- `composeCatalog` composes catalog fragments into one set of definitions. It validates each fragment's shape, then checks duplicate IDs, references, ownership, conflicts, and Finalize scripts across the union. When fragments come from named sources, it also applies the source rules and records each definition's source.
- `CatalogProtocol` holds the v1 protocol checks: `V1_INTERPRETER_CAPABILITIES`, `validateCatalogCapabilities`, and `decodeCatalogDocument`.
- `CatalogService` provides read-only lookup and projections for Blueprint resolution, recipe selection, CLI graphs, and Recipe Builder. `CatalogService.fromFragments` builds it from composed fragments. It does not own mutable generated workspaces.

`@repo/catalog` does no network or cache work. `CatalogLoader` in `@repo/scaffold` fetches documents and hands them to composition, as described in [catalog loading](catalog-loading.md "provides the composed catalog"). The [distribution decision](catalog-distribution.md "sets delivery and freshness policy") and the [source selection decision](catalog-source-selection.md "sets rules for composing sources") set the policy it follows. The [catalog definitions contract](../domain/catalog-definitions.md "defines the entities") defines targets, modules, and children.

The official target and module definitions live in `catalogs/official` and are built with `@repo/authoring`, like any external catalog. `catalogs/official/src/service.ts` builds the official document, with `catalogId` `stack-effect-official` and `finalizeScripts: "allow"`, for repository tooling and tests.

## Source organization

- `catalogs/official/src/targetRegistry.ts` defines target kinds and base contributions.
- `catalogs/official/src/moduleRegistry.ts` orders the per-file module groups from `catalogs/official/src/modules/`.
- `catalogs/official/templates/<owner>/` holds generated file bodies. The `template()` call in each definition is the authority for which file it uses, since shared and runtime-variant templates live under one owner. Edit their generated files first using the [catalog authoring workflow](../guides/catalog-authoring.md "governs template changes").
- `catalogs/author` defines the author catalog, which generates a standalone [catalog registry project](catalog-registry-project.md "records its shape").
- `packages/catalog/src/CatalogService.ts` indexes target kinds, module IDs, and capability providers.

Targets include workspace, package, server, CLI, React, and Foldkit destinations. Treat `targetRegistry.ts` as the complete list, rather than copying an exhaustive inventory into documentation. The `Registry` in these file names is naming only; it is not the hosted registry.

## Lookup and projections

Recipe Builder discovers stack presets as public, workspace-compatible modules in the `preset` category. A preset uses ordinary catalog dependencies. The builder shows resolved non-workspace targets from the preview Blueprint alongside explicitly selected targets. Required module edges identify modules that the builder includes automatically. Selecting an optional module on a resolved target can add that target to the explicit Selection.

`getTarget` and `getModule` fail with `CatalogNotFound` for unknown identifiers. `isSupportedOn` checks a concrete target identity. `getSupportedModules` filters by target kind and optional visibility, so callers that need exact-identity compatibility must still check the identity.

`getSource` returns the selected source that supplied a target or module, when sources are named. `getTargetKinds` supports visibility filtering. `getImplications` and `isImpliedByAny` expose implication metadata. `getCapabilityProviders` finds modules that provide a capability on a concrete target. `toBuilderCatalog` projects definitions for selection, while `toGraph` exposes catalog relationships.

Graph nodes are target and module definitions. Edge kinds are `supportedOn`, `requiredModule`, `implies`, and `childOf`. This graph is distinct from the resolved [Blueprint graph](../domain/blueprint-graph.md "instantiates selected definitions").

## Ownership and dependencies

A module contributes only to its owning target. Cross-target effects use tagged dependencies or implications. A client API module can require domain contracts and imply a server counterpart; it cannot directly write into the server target.

`required-target` requires a target identity. `required-module` requires a module attachment and its target. `required-capability` asks for a provider on a target; recipe or selection handling must resolve that provider before Blueprint resolution. `provides`, `conflictsWith`, and categories describe selectable alternatives.

## Capability provider resolution

`RecipeResolver.resolve` resolves providers before it returns the Selection. It walks every module the Blueprint would attach: selected modules, target required modules, `required-module` dependencies, and providers it adds, until nothing changes. A requirement is met when the Selection already has a module on the dependency target that provides the capability. A non-package dependency on the requester's own kind means the requester's target, as in Blueprint.

Capability requirements wait until the walk has reached every hard dependency: target required modules and `required-module` dependencies. When a module Blueprint attaches that way already provides the capability on the dependency target, that module joins the Selection and no strategy applies, because Blueprint reads providers from the Selection.

For any other unmet requirement, the candidates are the catalog's `getCapabilityProviders` for that target, in catalog order, that support the configured runtime and come from a source the requesting module may reference: its own source, or one its source declares in `requires`, as in catalog composition. Providers from other sources are neither added nor counted as alternatives. The `providerStrategy` decides:

- `fail-on-ambiguous` adds the only candidate and fails with `AmbiguousRecipeProvider`, listing every candidate, when there are several. `init`, `add`, `create`, `catalog workspace reset --target`, and Recipe Builder previews use it.
- `first-provider` adds the first candidate. The catalog workspace uses it when it selects every module.
- `explicit` adds the provider it names for that target and capability when it is a candidate, fails with `InvalidRecipeProvider`, listing the candidates, when it is not, and otherwise behaves like `fail-on-ambiguous`.

Every strategy fails with `MissingRecipeProvider` when there is no candidate. The provider joins the dependency target, and an absent target joins the Selection under the dependency's identity so Blueprint finds it. When the Selection already holds several providers, recipe resolution leaves them for Blueprint to reject. Identical recipes and catalogs give identical Selections, because the walk follows recipe and catalog order.

Children organize same-target selection UI. Required children are selected by that UI; they are not a substitute for dependency declarations. Visibility controls presentation, not authorization.

## Contributions

Definitions contain arrays of tagged `Contribution` values. Full files, package JSON entries, call arguments, object fields, and JSX slots remain semantic inputs to planning and composition. A package module publishes its entry points as `package.json` `exports` subpaths, not as re-exports in a composed `src/index.ts`; the v1 protocol rejects the retired `barrel-export` kind. See the [contribution contract](../domain/contributions.md "defines package entry points") for the rule and how existing projects are treated. Token resolution uses `ContributionTokenContext` and `StackConfig`.

See [contribution contracts](../domain/contributions.md "defines payloads"), [ID naming](catalog-id-semantics.md "guides identifiers"), and [compiled catalog research](../research/compiled-catalog-profiles.md "explores optional snapshots").
