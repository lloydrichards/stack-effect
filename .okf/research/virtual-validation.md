---
type: Research Report
title: Virtual validation and Finalize
description: Limits of filesystem injection for generated-project checks and external commands.
status: draft
sources:
  - id: preview
    resource: ../../packages/scaffold/src/service/apply/ApplyPreviewService.ts
    title: Current in-memory preview
  - id: recipe
    resource: ../../packages/scaffold/src/service/recipe/RecipePreviewService.ts
    title: Current recipe preview
  - id: runtime
    resource: ../../packages/scaffold/src/service/finalize/FinalizeService.ts
    title: Finalize command execution
generated: { by: codex, at: "2026-09-27T09:07:55+00:00" }
---

# Virtual validation and Finalize

Injected Effect `FileSystem` only redirects consumers of that service. Package managers, `node:fs`, native extensions, and subprocesses need explicit adaptation or a real directory.

Start any Vite experiment with one controlled profile. Measure cold time, repeated time, bundle growth, and diagnostic usefulness. An adapter-supported build does not establish general in-memory type-checking or package installation.

Test representative catalog combinations and incremental add through the production pipeline. Rebuild Plan from the first resulting workspace before testing idempotency. Retain host tests for operating-system and external-tool behavior.

The Apply-to-Finalize lifecycle must define which result Finalize acts on, including failed and skipped paths. The workspace facility must not silently decide that policy. A temporary host export is one possible validation mechanism, with cleanup and explicit treatment of tool-generated output.

[Staged workspaces](staged-workspace.md "provides candidate files") supply the input. [Generated artifacts](generated-artifacts.md "records validation stage") must distinguish generated source from post-Finalize state.

The existing host-backed catalog workspace still needs its own checks. Its failures should be reported separately from in-memory combination tests.
