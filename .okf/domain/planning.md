---
type: Contract
title: Planning and conflict terms
description: Domain definitions and invariants for planning and conflict terms.
status: stable
sources:
  - id: source-1
    resource: ../../packages/domain/src/Plan.ts
  - id: source-2
    resource: ../../packages/domain/src/Apply.ts
generated: { by: codex, at: "2026-09-22T17:40:50+00:00" }
---

# Planning and conflict terms

## RepoSnapshot

Definition:
Captured repository state used as planning input.

Invariants:

- Path entries are explicitly tagged as missing, directory, or file.

Connected terms:

- `Plan`

In code:

- `RepoSnapshot`

## CompositionOperations

Definition:
Array of tagged operations for composing file content (JSON or TypeScript).

Invariants:

- Operations are tagged unions with `_tag` and `fileType` discriminators.
- `fileType` is `"json"` or `"typescript"` for type-safe filtering.
- JSON operations: `json-pkg-exports`, `json-pkg-deps`, `json-pkg-scripts`.
- TypeScript operations: `ts-add-import`, `ts-add-reexport`, `ts-append-call-arg`, `ts-object-field`, and `ts-jsx-slot`.
- Composition behavior depends on the operation. Check the composer tests for duplicate handling and missing AST targets; do not assume every operation silently skips duplicates.
- Composition errors flow through Effect error channel as typed tagged errors.

Connected terms:

- `Plan`, `ComposedOutcome`

In code:

- `CompositionOperation`, `CompositionOperations`, `JsonCompositionOperation`, `TsCompositionOperation`

## ApplyDecision

Definition:
Per-path conflict policy used at apply time.

Invariants:

- Decision values are constrained to `override` or `skip`.

Connected terms:

- `Plan`, `Apply`

In code:

- `ApplyDecision`

See the [scaffold lifecycle](../architecture/scaffold-lifecycle.md "implements these contracts").
