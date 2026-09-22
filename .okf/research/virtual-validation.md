---
type: Research Report
title: Virtual validation and Finalize
description: Limits of filesystem injection for generated-project checks and external commands.
status: draft
sources:
  - id: catalog-validation
    resource: https://github.com/lloydrichards/stack-effect/issues/255
    title: Generated catalog validation defect
  - id: vite
    resource: https://github.com/lloydrichards/stack-effect/issues/251
    title: Vite validation experiment
  - id: finalize
    resource: https://github.com/lloydrichards/stack-effect/issues/179
    title: Apply-to-Finalize lifecycle
  - id: tests
    resource: https://github.com/lloydrichards/stack-effect/issues/253
    title: Materialized combination tests
  - id: runtime
    resource: ../../packages/scaffold/src/service/finalize/FinalizeService.ts
    title: Finalize command execution
generated: { by: codex, at: "2026-09-22T19:00:00+02:00" }
---

# Virtual validation and Finalize

Injected Effect `FileSystem` only redirects consumers of that service. Package managers, `node:fs`, native extensions, and subprocesses need explicit adaptation or a real directory.

Keep #251 to one controlled Vite profile and measure cold time, repeated time, bundle growth, and diagnostic usefulness. An adapter-supported build does not establish general in-memory type-checking or package installation.

Use #253 for representative catalog combinations and incremental add through the production pipeline. Rebuild Plan from the first resulting workspace before testing idempotency. Retain host tests for operating-system and external-tool behavior.

Issue #179 owns which Apply result Finalize acts on, including failed and skipped paths. The workspace facility must not silently decide that policy. A temporary host export is one possible validation mechanism, with cleanup and explicit treatment of tool-generated output.

[Staged workspaces](staged-workspace.md "provides candidate files") supply the input. [Generated artifacts](generated-artifacts.md "records validation stage") must distinguish generated source from post-Finalize state.

The existing host-backed catalog workspace also needs to pass its own checks. [Issue #255](https://github.com/lloydrichards/stack-effect/issues/255) tracks generated chat callback typing failures separately from the future combination harness.
