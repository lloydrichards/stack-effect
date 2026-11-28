---
type: Contract
title: Catalog definitions
description: Domain definitions and invariants for catalog definitions.
status: stable
sources:
  - id: source-1
    resource: ../../packages/domain/src/Catalog.ts
  - id: source-2
    resource: ../../packages/scaffold/src/internal/recipeResolver.ts
  - id: source-3
    resource: ../../packages/catalog/src/internal/compose.ts
generated: { by: codex, at: "2026-11-27T16:30:32Z" }
---

# Catalog definitions

## TargetDefinition

Definition:
Catalog entity that describes a scaffoldable target kind and base contributions.

Invariants:

- Identity is `kind`. The `title` is a display label for target pickers and can change independently of the kind.
- Includes contributions and optional scripts.
- An omitted app name and an explicit name equivalent to the catalog default resolve to the same target. Default folders use a kind prefix. React and Foldkit use the shared `client` folder prefix while retaining their full kind in their package names. Other explicit app names map to `apps/<name>`, including nested grouping segments.
- Logical target keys use the canonical kind and normalized name. Blueprint rejects distinct targets that claim the same package name. Plan resolves the actual directory by package name and checks directory ownership under the [repository state decision](../architecture/plan-apply-repository-state.md#preserve-package-ownership).

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
- Dependencies are tagged as `required-target`, `required-module`, or `required-capability`. A required module also requires its owning target. Module and capability dependencies use `target: "self"` for the requesting target, or a target identity for a specific destination. An empty identity name selects that kind’s default. Target dependencies always use an identity. Provider selection must resolve a required capability before Blueprint resolution; recipe resolution does this by [provider strategy](../architecture/catalog.md#capability-provider-resolution "defines provider resolution").
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

- Required children must support every target their parent supports. Optional children must share at least one supported target with their parent. See source 3.
- Requirement is either `"required"` (auto-selected when parent selected, not user-toggleable) or `"optional"` (user can toggle).
- A module listed as a child is excluded from top-level selection lists (inferred from parent relationship).
- Children are a UI/selection concept only; they do not affect Blueprint dependency resolution.

Connected terms:

- `ModuleDefinition`, `ModuleId`, `Visibility`

In code:

- `ModuleChild`

See the [catalog architecture](../architecture/catalog.md "implemented by").
