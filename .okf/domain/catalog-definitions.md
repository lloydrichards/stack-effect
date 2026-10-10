---
type: Contract
title: Catalog definitions
description: Domain definitions and invariants for catalog definitions.
status: stable
sources:
  - id: source-1
    resource: ../../packages/domain/src/Catalog.ts
generated: { by: codex, at: "2026-10-10T10:30:00+00:00" }
---

# Catalog definitions

## TargetDefinition

Definition:
Catalog entity that describes a scaffoldable target kind and base contributions.

Invariants:

- Identity is `kind`.
- Includes contributions and optional scripts.

Connected terms:

- `TargetKind`, `Contribution`, `ScriptDefinition`

In code:

- `TargetDefinition`

## ModuleDefinition

Definition:
Catalog entity that describes attachable capability, compatibility, dependencies, and contributions.

Invariants:

- Identity is `id: ModuleId`.
- Compatibility is declared via `SupportedOn` rules.
- Dependencies are tagged as `required-target`, `required-module`, or `required-capability`. A required module also requires its owning target. Provider selection must resolve a required capability before Blueprint resolution.
- Children declare same-target parent-child relationships for nested selection UI.
- Modules contribute only to their owning targets; target paths derive from the identity name, including slash-separated group segments.
- A catalog document containing a hierarchical default name, exact owner identity, or dependency identity requires the `target:hierarchical-name` interpreter capability. Ordinary contribution strings do not require it; flat catalog capability sets remain unchanged.
- Legacy `targetPath` metadata is rejected when decoding a catalog document.

Connected terms:

- `ModuleId`, `SupportedOn`, `Contribution`, `ModuleImplication`, `ModuleChild`

In code:

- `ModuleDefinition`

## ModuleChild

Definition:
A parent-child relationship between modules on the same target, used to organize nested selection in interactive CLI flows.

Invariants:

- Children must share at least one `SupportedOn` rule with their parent (same-target constraint).
- Requirement is either `"required"` (auto-selected when parent selected, not user-toggleable) or `"optional"` (user can toggle).
- A module listed as a child is excluded from top-level selection lists (inferred from parent relationship).
- Children are a UI/selection concept only; they do not affect Blueprint dependency resolution.

Connected terms:

- `ModuleDefinition`, `ModuleId`, `Visibility`

In code:

- `ModuleChild`

See the [catalog architecture](../architecture/catalog.md "implemented by").
