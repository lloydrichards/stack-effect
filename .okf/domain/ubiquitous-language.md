---
type: Reference
title: Ubiquitous language
description: Canonical wording for scaffold conversations and reviews.
status: stable
sources:
  - id: source-1
    resource: ../../packages/domain/src/Blueprint.ts
  - id: source-2
    resource: ../../packages/domain/src/Apply.ts
  - id: source-3
    resource: ../../packages/domain/src/CatalogSource.ts
  - id: source-4
    resource: ../../packages/domain/src/Catalog.ts
generated: { by: claude, at: "2026-09-29T18:00:00+02:00" }
---

# Ubiquitous language

Use the [lifecycle contracts](lifecycle.md "defines precise terms") and the [catalog source contracts](catalog-sources.md "defines source terms precisely") for definitions and invariants. Use the [scaffold lifecycle](../architecture/scaffold-lifecycle.md "describes implementation") for current behavior.

## Purpose

- Keep planning, implementation, and review language aligned.
- Prefer one canonical term per concept.
- Resolve ambiguity quickly when similar words appear.

## Canonical Flow Language

Use this sequence when describing the pipeline:

`CatalogSources -> CatalogDocument[] -> Composed Catalog`
`Catalog -> Selection -> Blueprint -> Plan -> Apply -> ApplyResult`
`Blueprint -> FinalizeScript[] -> ScriptResult[] -> FinalizeReport`

## Core Terms (conversation-ready)

## Scaffolding

Say:

- "Scaffolding is the bounded context that turns user intent into repository changes."

Avoid:

- "Generator internals"
- "Scaffold planning flow" as a substitute for the context name

## Catalog

Say:

- "Catalog is reference data for targets, modules, compatibility, and dependencies."
- "The loaded catalog is read-only within one operation. Hosted registry content can change between operations."

Avoid:

- Treating the loaded catalog as something that changes during an operation
- "Runtime state"

See also:

- `Selection`, `TargetDefinition`, `ModuleDefinition`, `Composed Catalog`

## Catalog Vocabulary

## Catalog Source

Say:

- "A catalog source is one named place a catalog document comes from."
- "The official source is the reserved name `official`; every other source is a custom source."

Avoid:

- "Registry" when one selected source is meant
- "Namespace" or "scope" (source names never qualify IDs)

See also:

- `Catalog Document`, `Source Provenance`, `Trust`

## Catalog Document

Say:

- "A catalog document is the v1 JSON one source serves, identified by its `catalogId`."

Avoid:

- Using `catalogId` and source name interchangeably (the project chooses the source name)
- "Catalog file" when the hosted document is meant

See also:

- `Catalog Source`, `requires`

## Composed Catalog

Say:

- "The composed catalog is the union of every selected document, validated once."

Avoid:

- "Merged catalog" or "overlay" (there is no override order; collisions are errors)

See also:

- `Catalog`, `Catalog Document`

## Source Provenance

Say:

- "Source provenance records which selected source supplied a target, module, or Finalize script."

Avoid:

- Treating provenance as precedence or permission

See also:

- `Catalog Source`, `Trust`

## requires

Say:

- "`requires: ["official"]` declares that a document references official definitions."

Avoid:

- Calling it a capability (`requiredCapabilities` is separate)
- Expecting it to add the official source implicitly

See also:

- `Catalog Document`, `Composed Catalog`

## Digest and Freshness

Say:

- "The digest is the SHA-256 hash of the bytes loaded from one source."
- "Freshness is `current` when the source served the document during this operation, and `cached` when an outage fell back to the last validated copy."

Avoid:

- "Version" or "pin" for a digest
- Treating a digest as a publisher signature

See also:

- `Catalog Source`

## Registry

Say:

- "The registry is the hosted set of catalog documents under `/registry/v1/`, such as `catalog.json` and `author.json`."

Avoid:

- Reading `moduleRegistry.ts` or `targetRegistry.ts` as the hosted registry (the file names are naming only)
- Saying "registry" for the loaded catalog

See also:

- `Catalog Document`

## Author Catalog

Say:

- "The author catalog is the catalog in `catalogs/author`, published as `author.json`, that generates a catalog registry project."
- "Local authoring definitions are the official definitions the repository builds from source."

Avoid:

- "Authoring catalog" for either one

See also:

- `Catalog Document`, `requires`

## Trust

Say:

- "Trust is run-time consent to execute Finalize scripts: `--yes` runs official scripts only, and `--trust` also runs scripts from custom sources."

Avoid:

- Treating a source name, `catalogId`, or cached copy as trust
- "Sandbox" (consent is the only boundary)

See also:

- `Source Provenance`, `FinalizeReport`

## Selection

Say:

- "Selection is what the user explicitly asked for."

Avoid:

- Calling selection a "resolved graph"
- Treating selection as dependency closure

See also:

- `Blueprint`, `TargetIdentity`, `ModuleId`

## Blueprint

Say:

- "Blueprint is the dependency-closure graph resolved from selection intent."

Avoid:

- "Selection result"
- "Plan" (they are not interchangeable)

See also:

- `Plan`, `BlueprintTargetNode`, `BlueprintAttachedModuleNode`

## Plan

Say:

- "Plan is the repository-aware model of outcomes and conflicts for one snapshot."

Avoid:

- "Diff view"
- "Apply request"

See also:

- `RepoSnapshot`, `CompositionOperations`, `Apply`

## Apply

Say:

- "Apply is execution intent: one plan plus per-path conflict decisions."

Avoid:

- "CLI flags"
- "Merge mode"

See also:

- `ApplyDecision`, `ApplyResult`

## ApplyResult

Say:

- "ApplyResult is what happened during execution: created, modified, skipped, failed."

Avoid:

- Using ApplyResult as if it were planning input

See also:

- `Apply`, `FinalizeReport`

## FinalizeReport

Say:

- "FinalizeReport is the ordered result of finalize-phase command execution."

Avoid:

- "Build log" as the canonical name

See also:

- `ScriptDefinition`, `ApplyResult`

## Identity and Compatibility Vocabulary

## TargetIdentity

Say:

- "TargetIdentity is the canonical `{ kind, name }` identity with key/path behavior."

Avoid:

- Substituting `TargetKey` or `TargetPath` when identity is meant

## TargetKey

Say:

- "TargetKey is the address key for lookup and graph identity."

Avoid:

- "Display name"

## TargetPath

Say:

- "TargetPath is the canonical filesystem location for a target."

Avoid:

- Treating path as identity semantics

## SupportedOn

Say:

- "SupportedOn declares where a module may attach: by kind or exact identity."

Avoid:

- "Runtime predicate" as the canonical term

## Visibility

Say:

- "Visibility controls whether a target or module is shown in interactive CLI flows: public entities are user-facing, internal entities are resolved only through dependencies or implications."

Avoid:

- "Hidden" or "visible" as substitutes for the canonical values
- Treating visibility as an access-control mechanism

See also:

- `TargetDefinition`, `ModuleDefinition`

## ModuleChild

Say:

- "ModuleChild declares a parent-child relationship between modules on the same target for nested selection."
- "Required children are auto-selected when the parent is selected; optional children are user-toggleable."
- "Children are inferred from parent relationships and excluded from top-level selection."

Avoid:

- Confusing children with dependencies (children are UI-only, dependencies affect Blueprint resolution)
- Using children for cross-target relationships (use dependencies or implications instead)

See also:

- `ModuleDefinition`, `Visibility`

## Ambiguities We Explicitly Resolve

- `Selection` means user intent; `Blueprint` means resolved implication.
- `Blueprint` means dependency closure; `Plan` means repository-aware projection.
- `TargetIdentity`, `TargetKey`, and `TargetPath` are related but distinct.
- `Catalog` is reference data, not mutable runtime state. Registry content changes between operations; the loaded catalog does not change within one.
- A `Catalog Source` name, a `catalogId`, and a target kind or module ID are three different identifiers.

## Quick Review Script

Use these checks in discussions and PR reviews:

- "Are we describing user intent (`Selection`) or resolved closure (`Blueprint`)?"
- "Are we discussing dependency logic (`Blueprint`) or repo changes/conflicts (`Plan`)?"
- "Are we naming identity (`TargetIdentity`), key (`TargetKey`), or location (`TargetPath`)?"
- "Are we talking plan intent (`Apply`) or execution outcome (`ApplyResult`)?"
- "Are we naming a selected source (`Catalog Source`), a document (`catalogId`), or a definition ID?"
