---
type: Contract
title: Contributions and configuration
description: Domain definitions and invariants for contributions and configuration.
status: stable
sources:
  - id: source-1
    resource: ../../packages/domain/src/Catalog.ts
  - id: source-2
    resource: ../../packages/domain/src/Plan.ts
  - id: protocol
    resource: ../../packages/catalog/src/CatalogProtocol.ts
  - id: package-layout
    resource: ../../.agents/skills/stack-effect-design/SKILL.md
  - id: loader-tests
    resource: ../../packages/scaffold/test/Catalog.test.ts
generated: { by: claude, at: "2026-11-24T00:00:00+00:00" }
---

# Contributions and configuration

## Contribution and NormalizedContributions

Definition:
Declarative desired repository state from targets/modules.

Invariants:

- `Contribution` is a tagged union of `file`, `pkg-json-entry`, `ts-call-arg`, `ts-object-field`, and `jsx-slot`. `NormalizedContributions` groups resolved target and module contributions.
- Values are declarative intent, not direct apply results.
- A generated package exposes each public module as its own `package.json` `exports` subpath, contributed as a `pkg-json-entry` with field `exports`, such as `./Api` mapped to `./src/Api.ts`. Consumers import the subpath, such as `@repo/db/TodoRepository`. Modules do not compose a root `src/index.ts` of re-exports. This follows the layout rule in the package design skill (source `package-layout`, "Lay out a package").
- The protocol no longer has a `barrel-export` contribution. A registry document that still contains one fails to decode with `CatalogDocumentInvalid`, and one that only declares `contribution:barrel-export` fails with `CatalogCapabilityUnsupported` (sources `protocol` and `loader-tests`). The kind was removed outright because no third-party catalogs depended on it.
- Existing projects keep any `src/index.ts` that an earlier scaffold composed. Plan no longer targets that path, so `add` neither updates nor deletes it, and no migration runs. Its re-exports keep working until the owner removes them.

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

- Runtime is `bun`, `deno`, or `node` with `pnpm` or `npm`.
- TypeScript version is `6` or `7`; legacy configs without the field resolve to `6`.
- Helper behavior derives runtime and package manager names from runtime shape.

Connected terms:

- `Selection`, `ContributionTokenContext`

In code:

- `StackConfig`, `Runtime`, `TypeScriptVersion`

See the [scaffold lifecycle](../architecture/scaffold-lifecycle.md "implements these contracts").
