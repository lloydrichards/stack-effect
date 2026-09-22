---
type: Contract
title: Blueprint graph
description: Domain definitions and invariants for blueprint graph.
status: stable
sources:
  - id: source-1
    resource: ../../packages/domain/src/Blueprint.ts
generated: { by: codex, at: "2026-09-22T17:40:50+00:00" }
---

# Blueprint graph

## BlueprintTargetNode

Definition:
A concrete target node in a blueprint closure.

Invariants:

- Node ID is a `TargetKey`.
- Node IDs are unique within a Blueprint.
- A target node ID is the canonical key derived from its identity.
- Carries full target identity.

Connected terms:

- `TargetIdentity`, `TargetKey`, `Blueprint`

In code:

- `BlueprintTargetNode`

## BlueprintAttachedModuleNode

Definition:
A resolved module attachment node owned by a blueprint target node.

Invariants:

- Node ID shape is `TargetKey#ModuleId`.
- The composite node ID agrees with the node's `targetId` and `moduleId`.
- Each node links to exactly one owning `targetId`.
- Each attached module has exactly one matching `owns-module` edge, and edge
  IDs are unique within the Blueprint.

Connected terms:

- `BlueprintTargetNode`, `ModuleId`, `Blueprint`

In code:

- `BlueprintAttachedModuleNode`, `toAttachedModuleNodeId`

See the [scaffold lifecycle](../architecture/scaffold-lifecycle.md "implements these contracts").
