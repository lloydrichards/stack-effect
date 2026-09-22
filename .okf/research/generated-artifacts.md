---
type: Research Report
title: Generated workspace artifacts
description: Open completeness and compatibility requirements for portable generated files.
status: draft
sources:
  - id: issue
    resource: https://github.com/lloydrichards/stack-effect/issues/252
    title: Portable artifact discussion
  - id: preview
    resource: ../../packages/scaffold/src/service/apply/ApplyPreviewService.ts
    title: Current changed-file result
  - id: report
    resource: effect-vfs-review.md
    title: Snapshot and delta evidence
generated: { by: codex, at: "2026-09-22T19:00:00+02:00" }
---

# Generated workspace artifacts

Choose a concrete consumer before defining a public artifact: project download, saved preview, reproduction fixture, or cache. State whether it contains a complete source tree, captured relevant state, or changes only.

Current previews omit unchanged and skipped files. Configuration is appended separately in Recipe previews. A complete artifact cannot be inferred from that list.

VFS snapshots can transport a concrete tree without keeping a live volume per variant. Deltas require a matching semantic base. A focused experiment in the research report confirmed sibling isolation and `BaseMismatch` when a sibling delta was applied to a changed base, despite disjoint edited paths.

Use a Stack Effect-owned versioned manifest so the snapshot codec remains replaceable. Candidate metadata includes source catalog identity, effective inputs, generation stage, supported entry types, root mapping, exclusions, integrity, and validation provenance. Distinguish pre-Finalize source files from installed or tool-modified output.

Metadata and timestamps can affect VFS delta identity. Define application content identity and controlled generation inputs instead of changing opaque snapshot bytes. Apply finite decode and volume limits; do not import dependency trees by default.

[Compiled catalog profiles](compiled-catalog-profiles.md "specializes catalog use") examines caching and parametrization. [Virtual validation](virtual-validation.md "bounds validation claims") explains what an artifact can claim about external tools.
