---
type: Research Report
title: Staged workspace lifecycle
description: Proposed ownership for repeatable previews and explicit host publication.
status: draft
sources:
  - id: report
    resource: effect-vfs-review.md
    title: VFS design research
  - id: preview
    resource: ../../packages/scaffold/src/service/apply/ApplyPreviewService.ts
    title: Current in-memory preview
  - id: vfs
    resource: https://github.com/lloydrichards/effect-virtual-fs/blob/e9df27fcb565d189bbc501500cc3267561b23533/packages/core/src/VirtualFileSystem.ts
    title: Inspected VFS overlay implementation
generated: { by: codex, at: "2026-09-27T10:47:32+00:00" }
---

# Staged workspace lifecycle

The bounded workspace facility is now implemented in `ApplyWorkspaceService`. It owns selective repository seeding, private Plan and Apply bindings, and capture of successful changed files. A host-seeded workspace accepts its matching host Plan after a freshness check; Plans built within the workspace use its private state. The session coordinator, decision experiments, host publication, and complete-tree artifact questions below remain proposals.

The scaffold-owned workspace centralizes creation, seeding, filesystem binding, and capture. A future workflow coordinator would own the baseline, Plan, conflict decisions, and candidate lifetime. Keep that facility narrower than end-to-end orchestration.

The proposed sequence is to capture supported repository state, build a Plan against it, apply explicit decisions in a private candidate, review the result, validate host preconditions, and publish accepted files.

VFS overlays begin from one immutable snapshot. They allow repeatable decision experiments and cheap disposal of unpublished changes. Replacing an overlay does not redirect existing callers; the owner must replace bindings and release scopes deliberately.

The [repository state decision](../architecture/plan-apply-repository-state.md "sets the authority contract") requires rejecting stale Plans and replanning. The shared workspace should consume that contract while owning selective setup, seeding, filesystem binding, and result capture. Baseline fingerprints alone do not eliminate the race between validation and writing, or provide atomic multi-file publication.

A bounded capture must reproduce relevant ancestor obstructions and declare what it omits. Keep conflict policy in Apply and host recovery outside VFS. Existing partial-write behavior should change only through an explicit contract decision.

The [current lifecycle](../architecture/scaffold-lifecycle.md "describes existing behavior") is the baseline. A [portable artifact](generated-artifacts.md "may capture results") is a separate consumer-led proposal.

## Evidence needed

Compare the same incremental-add case on host and VFS, including skipped conflicts, unrelated user content, shared-file composition, and ancestor obstructions. Test drift through modification, creation, deletion, and the wrong repository. Assert both results and final bytes.
