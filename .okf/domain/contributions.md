---
type: Contract
title: Contributions and configuration
description: Domain definitions and invariants for contributions and configuration.
status: stable
sources:
  - id: source-1
    resource: ../../packages/domain/src/Catalog.ts
  - id: source-2
    resource: ../../packages/domain/src/Scaffold.ts
generated: { by: codex, at: "2026-10-11T14:06:18+02:00" }
---

# Contributions and configuration

## Contribution and NormalizedContributions

Definition:
Declarative desired repository state from targets/modules.

Invariants:

- `Contribution` is a tagged union of `file`, `pkg-json-entry`, `pkg-json-field`, `barrel-export`, `ts-call-arg`, `ts-object-field`, and `jsx-slot`. `NormalizedContributions` groups resolved target and module contributions.
- `pkg-json-field` sets one complete `private`, `files`, `types`, `publishConfig`, `peerDependencies`, `dependencies`, or `exports` field from a JSON value. Object values replace the field rather than merge its entries. Nested string values resolve contribution tokens.
- Competing values for a field, or whole-field and entry contributions to the same field, are invalid planning intent. Differing values already on disk produce `packageJsonField` conflicts for Apply decisions.
- Values are declarative intent, not direct apply results.

Connected terms:

- `TargetContribution`, `ModuleContribution`, `Plan`

In code:

- `Contribution`

## TargetContribution

Definition:
Target-scoped contribution value keyed by target key.

Invariants:

- One contribution payload is tied to one target key.

Connected terms:

- `Contribution`, `TargetKey`

In code:

- `TargetContribution`

## ModuleContribution

Definition:
Module-scoped contribution value keyed by target key and module id.

Invariants:

- Captures declarative contribution intent for one module on one target. This is not a VFS overlay.

Connected terms:

- `Contribution`, `TargetContribution`, `ModuleId`

In code:

- `ModuleContribution`

## ContributionTokenContext

Definition:
Token-resolution context used when templating contribution contents.

Invariants:

- Includes target identity fields plus runtime, package manager, TypeScript version, and project name inputs.

Connected terms:

- `Contribution`, `StackConfig`

In code:

- `ContributionTokenContext`

## StackConfig

Definition:
Run-level configuration for runtime and toolchain choices.

Invariants:

- Runtime is `bun` or `node` with `pnpm|npm`.
- TypeScript version is `6` or `7`; legacy configs without the field resolve to `6`.
- Helper behavior derives runtime and package manager names from runtime shape.

Connected terms:

- `Selection`, `ContributionTokenContext`

In code:

- `StackConfig`, `Runtime`, `TypeScriptVersion`

See the [scaffold lifecycle](../architecture/scaffold-lifecycle.md "implements these contracts").
