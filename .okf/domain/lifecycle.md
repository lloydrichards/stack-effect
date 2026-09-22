---
type: Contract
title: Lifecycle terms
description: Domain definitions and invariants for lifecycle terms.
status: stable
sources:
  - id: source-1
    resource: ../../packages/domain/src/Catalog.ts
  - id: source-2
    resource: ../../packages/domain/src/Selection.ts
  - id: source-3
    resource: ../../packages/domain/src/Blueprint.ts
  - id: source-4
    resource: ../../packages/domain/src/Plan.ts
  - id: source-5
    resource: ../../packages/domain/src/Apply.ts
  - id: source-6
    resource: ../../packages/domain/src/Finalize.ts
generated: { by: codex, at: "2026-09-22T17:40:50+00:00" }
---

# Lifecycle terms

## Catalog

Definition:
Read-only reference data that defines what targets and modules can exist, plus compatibility and dependency rules.

Invariants:

- A catalog entry is either a target definition or a module definition.
- Catalog graph edges describe `supportedOn`, `requiredModule`, `implies`, and `childOf` relationships.
- A missing referenced catalog entity is a lookup failure (`CatalogNotFound`).

Connected terms:

- `TargetDefinition`, `ModuleDefinition`, `Selection`, `CatalogGraph`

In code:

- `CatalogNode`, `CatalogEdge`, `CatalogGraph`, `CatalogNotFound`

## Selection

Definition:
The explicit user request: target identities and requested module IDs per target.

Invariants:

- Selection is intent only, not dependency closure.
- Each selected target has one identity and a module list.
- Module references in selection are by canonical `ModuleId`.

Connected terms:

- `TargetIdentity`, `ModuleId`, `Blueprint`

In code:

- `Selection`

## Blueprint

Definition:
The resolved dependency-closure graph generated from selection intent.

Invariants:

- Blueprint contains target nodes and attached-module nodes.
- Edge reasons are explicit: `owns-module`, `required-target`, `required-module`.
- Node identity is stable through `TargetKey` and `TargetKey#ModuleId` patterns.

Connected terms:

- `BlueprintTargetNode`, `BlueprintAttachedModuleNode`, `Plan`

In code:

- `Blueprint`, `BlueprintTargetNode`, `BlueprintAttachedModuleNode`, `BlueprintFailure`

## Plan

Definition:
A repository-aware change model for one snapshot, with concrete outcomes and explicit conflicts.

Invariants:

- Plan is bound to repository reality (`RepoSnapshot`).
- Outcomes are typed as `complete` or `composed`.
- Conflicts are first-class entries, not side notes.
- Outcome paths are unique.
- Exact conflict diagnostics are unique, while one conflicted path may carry
  multiple distinct diagnostics.
- The set of conflicted outcome paths is exactly the set of paths represented
  by conflict diagnostics.

Connected terms:

- `RepoSnapshot`, `CompositionOperations`, `Apply`, `ApplyDecision`

In code:

- `Plan`, `PlanFailure`

## Apply

Definition:
Execution intent formed by one `Plan` and per-path conflict decisions.

Invariants:

- Apply always carries exactly one plan instance.
- Decisions are path-based and currently only `override` or `skip`; each
  conflicted path receives exactly one decision regardless of how many
  diagnostics describe it.
- Execution may fail with `ApplyFailure` reasons.

Connected terms:

- `ApplyDecision`, `ApplyResult`, `Plan`

In code:

- `Apply`, `ApplyDecision`, `ApplyFailure`

## ApplyResult

Definition:
Structured execution result listing created, modified, skipped, and failed paths.

Invariants:

- Failed entries carry path + reason details.
- Result values are report-ready, not planning intent.

Connected terms:

- `Apply`, `FinalizeReport`

In code:

- `ApplyResult`, `ApplyFailedPath`

## FinalizeReport

Definition:
Structured result of finalize-phase commands after apply execution.

Invariants:

- Executed results contain a label and command; failures also contain an error. Skipped scripts retain their workdir. The report also records unresolved conflicts and next steps.
- Success and failure counts are derived from per-entry status.

Connected terms:

- `ApplyResult`, `ScriptDefinition`

In code:

- `FinalizeReport`

See the [scaffold lifecycle](../architecture/scaffold-lifecycle.md "implements these contracts").
