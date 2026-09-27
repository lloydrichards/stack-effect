---
type: Decision
title: Repository state authority for Plan and Apply
description: Agreed state, freshness, and publication rules for the Plan to Apply handoff.
status: stable
sources:
  - id: plan
    resource: ../../packages/domain/src/Plan.ts
    title: Plan contract
  - id: apply
    resource: ../../packages/domain/src/Apply.ts
    title: Apply contract
  - id: capture
    resource: ../../packages/scaffold/src/service/plan/RepoSnapshotService.ts
    title: Current repository capture
  - id: planning
    resource: ../../packages/scaffold/src/service/plan/PlanService.ts
    title: Current Plan construction
  - id: execution
    resource: ../../packages/scaffold/src/service/apply/ApplyService.ts
    title: Current Apply behavior
  - id: writing
    resource: ../../packages/scaffold/src/service/apply/WriteEngine.ts
    title: Current host writes
generated: { by: codex, at: "2026-09-27T09:07:55+00:00" }
---

# Repository state authority for Plan and Apply

Status: The design is accepted. The current implementation does not yet enforce it.

## Problem

Plan classifies proposed changes against selected repository paths and their ancestors, but retains only outcomes and conflicts. Apply can then read newer contents when composing a file, or write authoritative contents over a file that changed after planning. Preview also reads current host contents. The user can therefore review one state and act on another. See the [current scaffold lifecycle](scaffold-lifecycle.md "describes implemented behavior").

## Decision

### Bind Plan to its repository and captured state

- A host Plan belongs to one canonical repository root. An alias resolving to that root is valid; another root is invalid even when its relevant files match. Planning must also work before the root exists, using the canonical existing parent and intended path to identify it.
- Plan records the type of every path planning inspected, including missing paths, ancestors, unchanged outcomes, and paths later skipped by an Apply decision. Existing text files use cryptographic content fingerprints. The serializable Plan does not contain copies of existing user files.
- Explicit planning paths remain in scope even when `.gitignore` matches them. Timestamps and permissions alone do not make a Plan stale. A file changed and restored before validation is acceptable when its checked type and contents match the recorded state.
- A symlink within the relevant paths, a non-text file, or a special entry makes planning fail clearly. A symlink used only as an alias to the repository root is resolved to the canonical root.

### Reject drift before preview or publication

- Planning rechecks its capture before returning a Plan. This detects a change observed during capture; it does not make the host filesystem transactional.
- Ordinary dry-run, file preview, and Apply reject a stale Plan and require replanning. They must not silently recompose from changed host contents. A Plan is stale after its successful Apply changes the repository.
- Before the first Apply write, compare every captured path with the current repository. Report every detected difference by path and change kind, without file contents. Detected preflight drift causes no Apply writes.
- Recheck each path before its write. If a later check detects drift, stop remaining writes, preserve the changed file, and return a typed stale error with the partial Apply result. The CLI should state what was already written and tell the user to replan.

### Keep host publication guarded

Apply's writer owns host publication and baseline checks. A private virtual workspace may hold the selected state during one workflow, while Plan keeps the serializable baseline. A broad tree export cannot replace the guarded writer. Shared workspace creation, seeding, and result capture are a separate design step described in the [staged workspace research](../research/staged-workspace.md "builds on this decision").

## Limits

The final check and the actual write are separate operations. Another process can change a file between them. Writes also remain per file, so an execution failure can leave a partial result. This decision does not promise a repository-wide transaction.

Configuration written before Plan and commands run after Apply have their own lifecycle contracts. The repository state rule here covers Plan, preview, and Apply, not those separate actions.

## Evidence required for implementation

- Modify, delete, or create a relevant path after planning. Preview and Apply must reject the stale Plan; preflight must leave the host unchanged. Cover composed and authoritative outcomes, missing paths, ancestors, unchanged paths, and skipped conflicts.
- Apply the same Plan through a canonical alias and try it against an unrelated root with identical relevant contents. Preserve greenfield planning for a root that does not exist yet.
- Preview an incremental add, edit a host file, then attempt Apply. The host edit must survive. A file restored to its captured state must be accepted.
- Change a later path after preflight but before its write. Apply must stop, preserve that path, report previous writes, and avoid subsequent writes.
- Reject relevant symlinks, non-text files, and special entries during planning. Verify that Plan and stale errors do not expose original file contents.
