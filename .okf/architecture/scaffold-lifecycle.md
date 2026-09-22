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
  - id: preview
    resource: ../../packages/scaffold/src/service/apply/ApplyPreviewService.ts
    title: Isolated Apply preview
  - id: recipe
    resource: ../../packages/scaffold/src/service/recipe/RecipePreviewService.ts
    title: Recipe preview
  - id: write
    resource: ../../packages/scaffold/src/service/apply/WriteEngine.ts
    title: Host write behavior
  - id: pipeline
    resource: ../../apps/cli/src/service/ScaffoldPipeline.ts
    title: CLI lifecycle
  - id: exports
    resource: ../../packages/scaffold/src/index.ts
  - id: finalize
    resource: ../../packages/scaffold/src/service/finalize/FinalizeService.ts
generated: { by: codex, at: "2026-09-22T17:40:50+00:00" }
---

# Scaffold lifecycle

Selection records user intent. Blueprint resolves dependencies. Plan describes repository-aware outcomes and conflicts. Apply adds explicit decisions only for conflicted paths. VFS state does not replace these domain values.

Plan reads relevant paths and ancestors through `RepoSnapshotService`. This is a selective text view, not a complete VFS snapshot. Plan retains outcomes rather than the full captured baseline.

Apply prepares composition before writing. For modified composed files, it re-reads current contents. Individual writes validate path state and use temporary-file rename; failures are collected while later writes continue. This does not provide a repository-wide transaction.

`ApplyPreviewService` copies changed, non-skipped paths into a fresh `MemoryFileSystem`, runs actual Apply, and returns successful changed files. `RecipePreviewService` plans in another memory filesystem and appends configuration to its result separately. Neither changed-file list claims to contain a complete repository.

Private previews use VFS `makeCrypto`, which provides reproducible identity generation without a platform Crypto dependency. These volume identities are not security credentials. The public VFS `make` and `layer` APIs require an explicitly supplied Crypto service.

Ordinary dry-run prepares actions without the same virtual write execution. Finalize commands use a process spawner, and the CLI can proceed into Finalize handling after reporting failed Apply paths.

The [staged workspace research](../research/staged-workspace.md "addresses consistency gaps") proposes a shared foundation. The [validation research](../research/virtual-validation.md "examines host execution") retains the external-tool boundary.

## Service ownership

`BlueprintService` validates Selection and resolves target/module dependency closure through CatalogService. Blueprint contains identities and dependency edges, not file contributions.

`PlanService` resolves contributions, compiles planning intent by path, loads relevant repository state, and asks `PlanAssessor` to classify outcomes. Outcomes are complete contents or base contents plus composition operations. Classifications are create, modify, unchanged, or conflict. A conflicted path can have multiple diagnostics but receives one ApplyDecision.

`ApplyService` prepares skip, authoritative-write, or composed-write actions. `CompositionEngine` dispatches JSON and TypeScript operations to their composers. `WriteEngine` enforces create, modify, or override expectations at each path. These internal services should not become caller-owned policy.

`ScaffoldFormatter` renders Blueprint and Plan for the CLI. RecipeService resolves recipe inputs; RecipePreviewService produces the builder preview. Consult the package exports for the current public service boundary.

## Finalize ownership

`FinalizeService.run` returns prepared scripts with execution functions. The caller executes them and collects results. Catalog scripts are deduplicated by command and workdir. Finalize-phase scripts precede config-derived install, lint, and format commands; post-finalize scripts follow them. Lint and format commands depend on configured tools, not only Biome.

The CLI owns trust decisions, skipped-script handling, conflict reporting, and assembly of FinalizeReport. A report contains executed success/failure results, skipped scripts, unresolved conflicts, and next steps. Output streams are separate from those structured results.

See [lifecycle terms](../domain/lifecycle.md "defines domain values"), [planning contracts](../domain/planning.md "defines conflicts"), and [catalog architecture](catalog.md "supplies definitions").
