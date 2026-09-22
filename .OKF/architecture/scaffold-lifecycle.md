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
generated: { by: codex, at: "2026-09-22T19:00:00+02:00" }
---

# Scaffold lifecycle

Selection records user intent. Blueprint resolves dependencies. Plan describes repository-aware outcomes and conflicts. Apply adds explicit decisions only for conflicted paths. VFS state does not replace these domain values.

Plan reads relevant paths and ancestors through `RepoSnapshotService`. This is a selective text view, not a complete VFS snapshot. Plan retains outcomes rather than the full captured baseline.

Apply prepares composition before writing. For modified composed files, it re-reads current contents. Individual writes validate path state and use temporary-file rename; failures are collected while later writes continue. This does not provide a repository-wide transaction.

`ApplyPreviewService` copies changed, non-skipped paths into a fresh `MemoryFileSystem`, runs actual Apply, and returns successful changed files. `RecipePreviewService` plans in another memory filesystem and appends configuration to its result separately. Neither changed-file list claims to contain a complete repository.

Private previews use VFS `makeCrypto`, which provides reproducible identity generation without a platform Crypto dependency. These volume identities are not security credentials. The public VFS `make` and `layer` APIs require an explicitly supplied Crypto service.

Ordinary dry-run prepares actions without the same virtual write execution. Finalize commands use a process spawner, and the CLI can proceed into Finalize handling after reporting failed Apply paths.

The [staged workspace research](../research/staged-workspace.md "addresses consistency gaps") proposes a shared foundation. The [validation research](../research/virtual-validation.md "examines host execution") retains the external-tool boundary.
