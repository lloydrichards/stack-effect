---
type: Contract
title: Identity and compatibility
description: Domain definitions and invariants for identity and compatibility.
status: stable
sources:
  - id: source-1
    resource: ../../packages/domain/src/Catalog.ts
generated: { by: codex, at: "2026-11-27T15:21:22Z" }
---

# Identity and compatibility

## TargetIdentity

Definition:
Canonical target identity with kind and name. A resolved app can also carry its placement.

Invariants:

- `toKey()` and `toPath()` are deterministic from identity fields.
- `matches()` checks either kind-level or exact-identity support rules.
- Each slash-separated name segment is normalized to kebab-case. Group segments determine directories; the final segment names the target. `server/sdk/api` resolves to `apps/sdk/api`, while `package/sdk/client` resolves to `packages/sdk/client`.
- npm names join all name segments with hyphens: `server-sdk-api` and `@repo/sdk-client` in those examples. Hierarchical and flat names remain different identities, but colliding npm names cannot coexist.
- Names reject empty, hidden, dot, `node_modules`, and unsafe directory segments. Package names must be non-empty; unnamed apps retain their kind-based default.
- Explicit app names select the named layout. A blank app name resolves to the catalog default. A dependency reuses a matching selected app. An unselected catalog default uses its default folder. An unselected non-default app uses the named layout so a copied command or later add can address it. CAFE uses fixed folders for its generated imports.
- A required target refers to an exact identity. A required module or capability on the same app kind can attach to the requesting app.

Connected terms:

- `TargetKind`, `TargetPath`, `TargetKey`, `SupportedOn`

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

## TargetPath

Definition:
Canonical repository location for a target.

Invariants:

- Path meaning is filesystem location.
- Path can equal key string in practice, but the role is different.

Connected terms:

- `TargetIdentity`, `TargetKey`

In code:

- `TargetPath`

## TargetKey

Definition:
Canonical lookup/address key for target identity and graph nodes.

Invariants:

- Key meaning is identity address, not filesystem semantics.
- Key is used as target-node identity in blueprint.

Connected terms:

- `TargetIdentity`, `TargetPath`, `BlueprintTargetNode`

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
