---
type: Contract
title: Identity and compatibility
description: Domain definitions and invariants for identity and compatibility.
status: stable
sources:
  - id: source-1
    resource: ../../packages/domain/src/Catalog.ts
  - id: source-2
    resource: ../../packages/domain/src/RepositoryPath.ts
generated: { by: codex, at: "2026-11-27T15:21:22Z" }
---

# Identity and compatibility

## TargetIdentity

Definition:
Canonical target identity with kind and name.

Invariants:

- `toKey()` uses the canonical kind and normalized name. `toPath()` suggests a directory for a new target using the identity and catalog default name.
- `matches()` checks either kind-level or exact-identity support rules.
- Each slash-separated name segment is normalized to kebab-case. Group segments determine directories; the final segment names the target. `server/sdk/api` resolves to `apps/sdk/api`, while `package/sdk/client` resolves to `packages/sdk/client`.
- npm names join all name segments with hyphens: `server-sdk-api` and `@repo/sdk-client` in those examples. Hierarchical and flat names remain different identities, but colliding npm names cannot coexist.
- Names reject empty, hidden, dot, `node_modules`, and unsafe directory segments. Package names must be non-empty; unnamed apps retain their kind-based default.
- An omitted app name and an explicit spelling of the catalog default resolve to the same identity. Plan reuses an installed directory by exact package name and uses the suggested directory for an absent package.
- A required target refers to an exact identity. A required module or capability on the same app kind can attach to the requesting app.

Connected terms:

- `TargetKind`, `RepositoryPath`, `TargetKey`, `SupportedOn`

In code:

- `TargetIdentity`

## TargetKind

Definition:
Target category used for identity and compatibility checks.

Invariants:

- Built-in kinds include `workspace` and `package`.
- Additional kinds are supported as branded strings.

Connected terms:

- `TargetIdentity`, `SupportedOn`, `TargetDefinition`

In code:

- `TargetKind`

## RepositoryPath

Definition:
A canonical POSIX path relative to the repository root. The value `.` represents the root.

Invariants:

- Reject absolute paths, Windows drive prefixes, and empty, dot, or traversal segments. Preserve the spelling of discovered directory names.
- Plan and Finalize derive installed target directories from the same captured owner inventory.

Connected terms:

- `TargetIdentity`, `TargetKey`

In code:

- `RepositoryPath`

## TargetKey

Definition:
Canonical lookup/address key for target identity and graph nodes.

Invariants:

- Key meaning is identity address, not filesystem semantics.
- Key is used as target-node identity in blueprint.

Connected terms:

- `TargetIdentity`, `RepositoryPath`, `BlueprintTargetNode`

In code:

- `TargetKey`

## ModuleId

Definition:
Canonical module identifier used across catalog, selection, and blueprint attachment IDs.

Invariants:

- Module identity is stable and branded.

Connected terms:

- `ModuleDefinition`, `Selection`, `BlueprintAttachedModuleNode`

In code:

- `ModuleId`

## Visibility

Definition:
Classification that controls whether a catalog entity (target or module) is presented to users in interactive CLI flows.

Invariants:

- Value is either `"public"` (shown in interactive pickers) or `"internal"` (resolved only through dependencies, implications, or required-module rules).
- Defaults to `"public"` when omitted from a definition.
- Non-interactive (flag-based) CLI paths bypass visibility filtering.
- Blueprint resolution ignores visibility and operates on all catalog entities.

Connected terms:

- `TargetDefinition`, `ModuleDefinition`, `CatalogReader`

In code:

- `Visibility`

## SupportedOn

Definition:
Compatibility rule describing where a module may attach.

Invariants:

- Rule shape is either `kind` or exact `identity`.
- Matching uses `TargetIdentity.matches(...)`.

Connected terms:

- `ModuleDefinition`, `TargetIdentity`, `TargetKind`

In code:

- `SupportedOn`

See the [scaffold lifecycle](../architecture/scaffold-lifecycle.md "implements these contracts"). The [ubiquitous language](ubiquitous-language.md "gives conversation wording") shows how to say these terms in reviews.
