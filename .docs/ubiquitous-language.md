# Ubiquitous Language

This document is the speaking guide for domain conversations.
For full definitions and invariants, see `docs/DOMAIN_LEXICON.md`.

## When to Use This Document

| Need | Use |
|------|-----|
| Quick phrasing for discussions, PRs, commits | This document |
| Precise definitions, invariants, code identifiers | `DOMAIN_LEXICON.md` |
| Current domain decisions and constraints | `CONTEXT.md` |

## Purpose

- Keep planning, implementation, and review language aligned.
- Prefer one canonical term per concept.
- Resolve ambiguity quickly when similar words appear.

## Canonical Flow Language

Use this sequence when describing the pipeline:

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

- "Catalog is read-only reference data for targets, modules, compatibility, and dependencies."

Avoid:

- "Mutable registry"
- "Runtime state"

See also:

- `Selection`, `TargetDefinition`, `ModuleDefinition`

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
- `Catalog` is reference data, not mutable runtime state.

## Quick Review Script

Use these checks in discussions and PR reviews:

- "Are we describing user intent (`Selection`) or resolved closure (`Blueprint`)?"
- "Are we discussing dependency logic (`Blueprint`) or repo changes/conflicts (`Plan`)?"
- "Are we naming identity (`TargetIdentity`), key (`TargetKey`), or location (`TargetPath`)?"
- "Are we talking plan intent (`Apply`) or execution outcome (`ApplyResult`)?"
