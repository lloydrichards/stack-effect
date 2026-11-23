---
type: Architecture
title: Scaffold lifecycle
description: Current domain boundaries and filesystem ownership in Stack Effect.
status: stable
sources:
  - id: plan
    resource: ../../packages/scaffold/src/service/plan/PlanService.ts
    title: Plan construction
  - id: apply
    resource: ../../packages/scaffold/src/service/apply/ApplyService.ts
    title: Apply preparation and execution
  - id: workspace
    resource: ../../packages/scaffold/src/service/apply/ApplyWorkspaces.ts
    title: In-memory workspace creation and materialization
  - id: recipe
    resource: ../../packages/scaffold/src/service/recipe/RecipePreviewer.ts
    title: Recipe preview
  - id: write
    resource: ../../packages/scaffold/src/service/apply/AtomicWriter.ts
    title: Host write behavior
  - id: pipeline
    resource: ../../apps/cli/src/service/ScaffoldPipeline.ts
    title: CLI lifecycle
  - id: exports
    resource: ../../packages/scaffold/src/index.ts
  - id: finalize
    resource: ../../packages/scaffold/src/service/finalize/FinalizeService.ts
  - id: loader
    resource: ../../packages/scaffold/src/service/catalog/CatalogLoader.ts
    title: Catalog loading and composition
  - id: services
    resource: ../../apps/cli/src/services.ts
    title: CLI command service layer
  - id: contribution-resolver
    resource: ../../packages/scaffold/src/service/plan/ContributionResolver.ts
  - id: readme-contract
    resource: ../../packages/scaffold/src/service/recipe/Readmes.test.ts
generated: { by: codex, at: "2026-11-23T00:00:00+00:00" }
---

# Scaffold lifecycle

Selection records user intent. Blueprint resolves dependencies. Plan describes repository-aware outcomes and conflicts. Apply adds explicit decisions only for conflicted paths. VFS state does not replace these domain values.

The catalog is loaded before Selection. A CLI command resolves its catalog sources, loads and composes them, and only then builds the services that resolve Selection, Blueprint, Plan, Apply, and Finalize. Every stage reads that one `CatalogService`, as the [distribution decision](catalog-distribution.md "keeps one catalog per operation") requires. [Catalog loading](catalog-loading.md "loads the catalog first") describes the loader and caches.

Plan captures relevant paths, ancestors, and the root through `RepositoryState`. This is a selective text view, not a complete VFS snapshot. Plan retains outcomes and a serializable baseline with the canonical root, path types, and SHA-256 fingerprints of existing text files. It does not retain existing file contents.

Apply checks every baseline path before preparing composition or writing. For modified composed files, it re-reads contents after that check. Each write checks its target and ancestors again, then uses a temporary-file rename. A later stale check stops remaining writes and reports the partial result. Other execution failures are collected while later writes continue. This does not provide a repository-wide transaction.

`ApplyWorkspaces` creates a private `MemoryFileSystem`. `empty` starts it without repository files; `fromRepository` checks and seeds the paths recorded in a host Plan baseline, then checks that baseline again. A host Plan must match that seeded baseline, and materialization rechecks the host before using it. A Plan built inside the workspace can apply against the same private state. Materialization returns the Apply result and successful changed files read from that workspace. The CLI dry run previews a host Plan by creating a workspace from its baseline and materializing the Apply. `RecipePreviewer` plans and applies in one workspace and appends configuration to its result separately. Neither changed-file list claims to contain a complete repository.

Private previews use VFS `make` with an explicitly supplied Crypto service. Volume identities are not security credentials.

The dry run reports the statuses that Apply observed in that workspace, with or without the file contents. Finalize commands use a process spawner, and the CLI can proceed into Finalize handling after reporting failed Apply paths.

The [repository state decision](plan-apply-repository-state.md "defines the implemented handoff") records the freshness rule. The [staged workspace research](../research/staged-workspace.md "addresses consistency gaps") proposes a shared foundation. The [validation research](../research/virtual-validation.md "examines host execution") retains the external-tool boundary.

## Service ownership

`BlueprintService` validates Selection and resolves target/module dependency closure through CatalogService. Blueprint contains identities and dependency edges, not file contributions.

`PlanService` resolves contributions, compiles planning intent by path with `PlanningIntent`, loads relevant repository state, and classifies outcomes with the pure `PlanAssessment` module. Outcomes are complete contents or base contents plus composition operations. Classifications are create, modify, unchanged, or conflict. A conflicted path can have multiple diagnostics but receives one ApplyDecision.

The CLI rejects required dependency conflicts before Apply in interactive and automatic modes. Other conflicted paths retain explicit override or skip decisions. This policy stays in `ScaffoldPipeline`; Plan remains policy-free.

`ApplyService` prepares skip, authoritative-write, or composed-write actions. The pure `Composition` module routes JSON and TypeScript operations to `JsonComposition` and `TypeScriptComposition`. `AtomicWriter` enforces create, modify, or override expectations at each path. These internals should not become caller-owned policy.

The CLI renders Blueprint and Plan itself; `@repo/scaffold` returns data only. RecipeService resolves recipe inputs; RecipePreviewer produces the builder preview. Consult the package exports for the current public service boundary.

## Generated READMEs

Contribution resolution derives the workspace inventory and initial scaffold recipe from the resolved Blueprint. The recipe includes resolved target identities and attached modules, including selected providers. The root README describes the starting project. Target READMEs use the resolved target's identity and modules.

Official README contributions create missing files and classify differing existing contents as conflicts. A skip decision preserves an edited README. Replacing it requires an explicit override, so the root recipe is intended as a record of initial scaffolding. The [authoring guide](../guides/catalog-authoring.md "documents README tokens") lists the tokens used by these templates.

## Finalize ownership

`FinalizeService.scripts` returns the ordered scripts as data, for both preview and execution. The caller selects scripts, runs each with `FinalizeService.executeScoped` in a scope it owns, and collects results. Catalog scripts are deduplicated by source, workdir, and command. The source is part of the key, so a custom script can never stand in for an official one. Finalize-phase scripts precede config-derived install, lint, and format commands; post-finalize scripts follow them. Lint and format commands depend on configured tools, not only Biome.

The CLI owns trust decisions, as the [source selection decision](catalog-source-selection.md "gates Finalize scripts by source") defines them, as well as skipped-script handling, conflict reporting, and assembly of FinalizeReport. A report contains executed success/failure results, skipped scripts, unresolved conflicts, and next steps. Output streams are separate from those structured results.

See [lifecycle terms](../domain/lifecycle.md "defines domain values"), [planning contracts](../domain/planning.md "defines conflicts"), and [catalog architecture](catalog.md "supplies definitions").
