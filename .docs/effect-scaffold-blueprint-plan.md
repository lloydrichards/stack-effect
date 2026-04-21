# Effect Scaffold: Blueprint and Plan Design

## Purpose

This document reconstructs the current design for the scaffold system's
`Blueprint` and `Plan` phases.

The system is intentionally split into three conceptual stages:

1. `Selection`
2. `Blueprint`
3. `Plan`

`Selection` remains the explicit user-authored request. This document focuses on
the two downstream phases:

- `Blueprint`: resolve and normalize scaffold intent
- `Plan`: compile that intent against repo state into a virtual filesystem plan

This phase split is deliberate. The user should be able to inspect and confirm a
`Blueprint` before any repo-aware planning happens.

## Scope

### In scope

- `Blueprint` as a user-reviewable resolved graph
- `Plan` as a repo-aware virtual filesystem projection
- typed dependency expansion
- canonical implied targets and modules
- narrow slot-override handling during blueprint normalization
- safe merge planning for a small set of recognized file classes
- path classification without writing to disk
- full ambiguity reporting without fail-fast behavior

### Out of scope

- writing files to disk
- interactive conflict resolution
- arbitrary text patching
- broad template engine design
- user-editable blueprint ingestion in v1
- post-write install, format, git, or migration work
- CI or GitHub workflow scaffolding as part of root bootstrap

## Working model

```text
Selection
  -> Blueprint
  -> Plan
```

### Selection

`Selection` is the explicit user-authored request.

It contains only:

- selected targets, with target modules nested inside each target
- selected repo modules

It does not contain implied dependencies, resolved graph edges, repo-state
knowledge, or merge decisions.

### Blueprint

`Blueprint` is the normalized resolved scaffold graph.

It answers:

- which targets exist conceptually
- which repo modules exist conceptually
- which target modules each resolved target contains
- which items were selected vs implied
- why each resolved item exists
- which normalized intents should be passed to planning

It does not answer:

- whether those things already exist on disk
- exact file classifications against the repo
- final merge behavior for ambiguous existing files

### Plan

`Plan` is the repo-aware virtual filesystem projection compiled from a confirmed
`Blueprint` plus the current repo snapshot.

It answers:

- which file paths should exist
- which planned file paths are `create`, `modify`, `unchanged`, or
  `needsMergeStrategy`
- which paths require later merge decisions
- what the full virtual tree looks like

It does not write anything to disk.

## Design principles

### Blueprint is a confirmation checkpoint

`Blueprint` is not just an internal IR. It is a user-reviewable artifact.

Normal workflow:

1. resolve `Selection` into `Blueprint`
2. confirm the `Blueprint`
3. build the `Plan`

In v1, confirmation is read-only. Editable blueprint round-tripping is deferred.

### Plan consumes trusted blueprint input

`PlanService` should accept a resolved `Blueprint` and should not rerun
blueprint-resolution logic internally.

### Keep modules scoped explicitly

The term `module` is overloaded. The design distinguishes:

- `Repo module`: applies once at repo scope
- `Target module`: belongs to one target as part of that target's module set
- `Capability`: the shared idea a module may represent

At the public boundary, target modules should be nested under their target rather
than modeled as a separate top-level collection. That keeps `Selection` and the
reviewed `Blueprint` simpler to read.

### Prefer canonical identities over invented names

Dependency expansion may imply:

- repo modules
- canonical package targets
- target modules attached to specific targets

It should not invent arbitrary non-canonical app targets in v1.

### Normalize early, reconcile late

Blueprint normalization handles:

- dependency expansion
- duplicate normalization
- explicit vs implied precedence
- slot override resolution
- contradictory composition failures

Planning should only reconcile normalized scaffold intent against repo state.

### Report all ambiguities

Planning should not stop at the first unresolved merge. It should accumulate all
ambiguous paths and continue building the rest of the plan.

## Core language

Canonical terms are defined in `UBIQUITOUS_LANGUAGE.md`. The most important ones
for this document are:

- `Selection`
- `Blueprint`
- `Plan`
- `Target kind`
- `Target`
- `Canonical target`
- `Repo module`
- `Target module`
- `Intent`
- `Repo snapshot`
- `Merge requirement`
- `Cause`

## Blueprint design

### Responsibilities

`BlueprintService` is responsible for:

- validating selected target kinds and module ids
- validating target-module compatibility
- rejecting conceptual target collisions
- expanding required repo modules and canonical targets
- attaching implied target modules to specific resolved targets
- preserving selected vs implied status
- preserving typed causes for why items exist
- resolving narrow slot overrides
- emitting a flat normalized intent set
- surfacing structured warnings

### Resolved graph shape

The public blueprint should group target modules under each resolved target.

The resolved graph should distinguish:

- resolved targets
- resolved repo modules

Each resolved target should include:

- stable identity
- selected or implied status
- typed causes
- nested resolved target modules, each with its own selected or implied status and
  typed causes

Internally, the resolver may still flatten target-module state temporarily if it
helps normalization, but that should not leak into the public shape.

### Target identity

Target identity should align with conceptual repo path identity.

For v1 monorepo conventions:

- app targets conceptually map to `apps/<name>`
- package targets conceptually map to `packages/<name>`

That means collisions should be detected at the conceptual path level, not only
by target kind plus name.

### Target kinds

V1 target kinds are concrete archetypes, not just broad scopes:

- `client`
- `server`
- `server-mcp`
- `cli`
- `package`

Each target kind owns a base skeleton.

That base skeleton may also imply base requirements, such as repo bootstrap.

### Repo modules

The key repo module in v1 is the umbrella bootstrap capability:

- `root-bootstrap`

Every target kind depends on `root-bootstrap` in v1.

Users may still select `root-bootstrap` explicitly for repo-only initialization.

### Canonical targets

Dependency expansion may imply fixed canonical targets.

For the first slice, the important canonical package target is:

- `package/domain`

Bootstrap infrastructure such as `packages/config-typescript` is owned by
`root-bootstrap` rather than modeled as a general-purpose canonical target.

### First-slice dependency shape

The first deliberate implementation slice is:

- `root-bootstrap`
- `package`
- `server`
- `domain-api`
- `http-api-server`

In that slice:

- `server` remains transport-agnostic at the base skeleton layer
- `http-api-server` is a target module attached to a server target
- `http-api-server` implies canonical `package/domain`
- `http-api-server` also requires the `domain-api` target module on
  `package/domain`

This proves cross-target dependency expansion without introducing client, RPC,
WebSocket, MCP, AI, or presence behavior yet.

### Selected vs implied precedence

Resolved identity should be unique.

If the same target or module is both selected and implied:

- keep one resolved instance
- classify it as selected
- preserve the implied reason in typed cause metadata

For target modules, that precedence should be expressed inside the owning target
rather than in a separate top-level resolved target-module list.

### Dependency model

Dependency declarations should be data-first wherever possible.

The design needs to distinguish at least:

- required repo modules
- required canonical targets
- required target modules on specific resolved target identities

Builder functions should not hide dependency logic ad hoc.

### Builder context

Target-kind and module builders need richer context than just target name and
kind. They should receive enough normalized resolution context to emit
deterministic intents.

### Warnings and errors

Use typed errors for invalid blueprint construction, such as:

- unknown target kind id
- unknown module id
- invalid target-module combination
- conceptual target collision
- dependency cycle
- required non-canonical app companion that v1 cannot imply
- contradictory slot ownership or unresolved blueprint-time composition

Use structured warnings for non-fatal conditions, such as:

- duplicate selections normalized away
- redundant selections covered by dependency closure
- implied dependencies added automatically

### Slot overrides

V1 supports narrow blueprint-time slot overrides, not generic arbitrary file
replacement.

These overrides exist to solve cases where a target kind's base skeleton exposes
a small set of overridable defaults.

The key first-slice example is the generic `package` base skeleton:

- by default, it creates `src/index.ts`
- by default, it exposes a root package entrypoint

But canonical `package/domain` with the `domain-api` target module should:

- own `src/Api.ts`
- expose only the `./Api` public contract in the first slice

That means the module must override the package public-entrypoint slot during
blueprint normalization.

Slot overrides should:

- be explicit and narrow
- be resolved entirely inside `BlueprintService`
- not appear as public override intents

### Intents

The public blueprint should emit a flat deterministic intent set.

Intents describe what should exist, not how to patch arbitrary existing files.

Important intent families for this design include:

- full-file source creation
- package dependency additions
- package script additions
- package export additions
- barrel export additions
- narrowly-scoped JSON extension where still necessary

The final blueprint must be normalized and conflict-free before being passed to
planning.

## Plan design

### Responsibilities

`PlanService` is responsible for:

- loading the repo snapshot needed by the blueprint
- compiling blueprint intents into concrete repo paths and planned file content
- performing safe structured merges where supported
- classifying planned file paths
- building the virtual tree
- collecting merge requirements and warnings

### Public workflow

The planning API should remain centered on confirmed blueprint input:

1. `BlueprintService.resolve(selection) -> Blueprint`
2. confirm blueprint
3. `PlanService.build({ blueprint, repoRoot }) -> Plan`

### Repo snapshot loading

`RepoSnapshotLoader` remains a distinct concern, but planning owns repo-aware
orchestration.

Snapshot loading should be:

- selective for file content, driven by the confirmed blueprint
- broad enough for path and directory existence checks needed for projection

Planning does not need to model the entire repository in v1.

### Root bootstrap planning

`root-bootstrap` must support both:

- empty-directory bootstrap
- existing-repo reconciliation

Bootstrap includes minimal monorepo foundation only, such as:

- root `package.json`
- workspace configuration
- root tool configuration like `turbo.json` and `biome.jsonc`
- `.gitignore`
- `packages/config-typescript`

Bootstrap does not include optional capability packages or CI workflow setup.

### Path derivation

Planning is the central authority for path derivation.

Examples:

- `App(api)` -> `apps/api/...`
- `Package(domain)` -> `packages/domain/...`
- repo-root targets -> root-level paths

Path conventions should not be redefined independently in each compiler.

### File ownership vs contribution

V1 must distinguish:

- authoritative full-file ownership
- narrow additive contribution to recognized mergeable structures

`AddSourceFile` means authoritative ownership of a full path.

If the file already exists with different content and no specialized merge
strategy exists, the result should be `needsMergeStrategy`, not a line-based
patch.

### Recognized file classes

V1 should support a small set of recognized file classes:

- `package.json`
- `tsconfig.json` with conservative handling
- simple barrel files such as `src/index.ts`
- generated source files fully owned by the scaffold
- root bootstrap config files explicitly covered by the bootstrap compiler

Everything else is either:

- create-only
- unchanged by exact match
- `needsMergeStrategy` if merge would be required

### Structured merge coverage

Safe structured merge coverage in v1 should be narrow and explicit.

Supported additive merge cases:

- package dependency additions
- package script additions
- package export additions
- simple barrel export additions
- additive recognized root workspace updates

These should use dedicated semantic intents rather than a generic opaque JSON
patch model wherever possible.

### Package operations

`package.json` operations should be represented explicitly.

Recommended dedicated operations:

- `AddPackageDependency`
- `AddPackageScript`
- `AddPackageExport`

Dependency additions must also capture their section, such as:

- `dependencies`
- `devDependencies`

This matters for repo packages such as `@repo/config-typescript` versus runtime
dependencies such as `@repo/domain`.

### Tsconfig handling

`tsconfig.json` varies meaningfully across target kinds, so v1 should be
conservative.

Support only:

- create known files when absent
- `unchanged` when exact content already exists
- `needsMergeStrategy` when an incompatible existing file would need a merge

Broad safe tsconfig merging is deferred.

### Classification

Each planned file path should be classified as:

- `create`
- `modify`
- `unchanged`
- `needsMergeStrategy`

The primary public contract is file-path classification.

Directory nodes exist mainly to support projection and tree display.

### Tree projection

The public plan should expose:

- flat path entries for reporting and future apply work
- a nested virtual tree for inspection

The nested tree should represent the full planned projection, not just deltas.

That means unchanged relevant nodes may still appear.

### Planned content visibility

The planner should retain planned file contents internally to support:

- comparison against the repo snapshot
- future apply work

But v1 should not expose a public machine-readable path-to-content map.

### Ambiguity handling

If an existing file shape is unrecognized or cannot be merged safely:

- mark that path as `needsMergeStrategy`
- add a merge requirement
- continue building the rest of the plan

Planning ambiguity is not a blueprint failure.

## Service boundaries

Recommended services:

- `TargetCatalog`
- `ModuleCatalog`
- `BlueprintService`
- `RepoSnapshotLoader`
- `IntentCompiler`
- `PlanService`

### TargetCatalog

Provides registered target-kind definitions.

### ModuleCatalog

Provides registered repo-module and target-module definitions.

### BlueprintService

Resolves a `Selection` into a reviewed normalized `Blueprint`.

### RepoSnapshotLoader

Loads the narrow repo-state view needed for planning.

### IntentCompiler

Compiles normalized intents into concrete planned file outputs.

### PlanService

Builds a `Plan` from a confirmed `Blueprint` plus repo root.

## Registry style

The initial registry should be:

- static
- in-memory
- hand-authored
- minimal

Definitions should be primarily plain data plus small builder functions. Effect
services provide validated lookup, not dynamic registry loading.

## Testing expectations

The first implementation should emphasize behavior-first end-to-end tests.

Important test categories:

- selection to blueprint happy path for the first slice
- root-bootstrap implication
- nested target-module ownership and cross-target dependency expansion
- canonical `package/domain` implication
- `domain-api` attachment
- slot override behavior for package public entrypoint
- deterministic normalized blueprint output
- empty-directory planning
- existing-repo `create` / `modify` / `unchanged` classification
- ambiguous merge reporting that still allows the rest of the plan to build

Main pipeline tests should prefer real temporary directories for repo-state
fixtures instead of heavy filesystem mocking.

## Implementation order

Suggested order:

1. define schema-backed domain models for `Selection`, `Blueprint`, `Intent`, and
   `Plan`
2. implement static target and module registries for the first slice
3. implement selection validation and collision checks
4. implement blueprint resolution for resolved targets with nested target modules
   plus resolved repo modules
5. implement root-bootstrap implication
6. implement canonical `package/domain` implication and `domain-api` attachment
7. implement slot override normalization for package public entrypoint
8. emit deterministic flat blueprint intents
9. implement narrow repo snapshot loading
10. implement planning compilers for the first recognized file classes
11. add classification, merge requirement collection, and virtual tree
12. expand coverage only after the first end-to-end slice is stable

## Summary

The current design is intentionally narrow and phase-driven:

- `Selection` remains explicit and user-authored
- `Blueprint` becomes the reviewed normalized scaffold graph
- `Plan` becomes the repo-aware virtual projection

Blueprint owns dependency expansion and scaffold composition.
Plan owns repo reconciliation and path classification.

This gives the scaffold system a stable foundation for a later apply layer
without forcing apply-time decisions into the initial implementation.
