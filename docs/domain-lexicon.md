# Domain Lexicon

This is the dictionary for terms used in the `Scaffolding` bounded context.
Each term has a plain-language meaning, invariants, and connections to related terms.

## Reading Guide

- Use this document for precise term lookup and invariants.
- Use `UBIQUITOUS_LANGUAGE.md` for conversational phrasing in discussions and reviews.
- Prefer code identifiers exactly as shown in each "In code" list.

## Scope

- **Context**: `Scaffolding`
- **Mission**: turn user intent into a structured repository shape
- **Starts at**: `Selection` + `StackConfig`
- **Ends at**: final run communication in `FinalizeReport`
- **Out of scope**: CLI/web transport details and long-term config persistence

## Canonical Flow

`Catalog -> Selection -> Blueprint -> Plan -> Apply -> FinalizeReport`

## Lifecycle Terms

### Catalog

Definition:
Read-only reference data that defines what targets and modules can exist, plus compatibility and dependency rules.

Invariants:

- A catalog entry is either a target definition or a module definition.
- Catalog edges only describe supported-on, required-module, or implied relationships.
- A missing referenced catalog entity is a lookup failure (`CatalogNotFound`).

Connected terms:

- `TargetDefinition`, `ModuleDefinition`, `Selection`, `CatalogGraph`

In code:

- `CatalogNode`, `CatalogEdge`, `CatalogGraph`, `CatalogNotFound`

### Selection

Definition:
The explicit user request: target identities and requested module IDs per target.

Invariants:

- Selection is intent only, not dependency closure.
- Each selected target has one identity and a module list.
- Module references in selection are by canonical `ModuleId`.

Connected terms:

- `TargetIdentity`, `ModuleId`, `Blueprint`

In code:

- `Selection`

### Blueprint

Definition:
The resolved dependency-closure graph generated from selection intent.

Invariants:

- Blueprint contains target nodes and attached-module nodes.
- Edge reasons are explicit: `owns-module`, `required-target`, `required-module`.
- Node identity is stable through `TargetKey` and `TargetKey#ModuleId` patterns.

Connected terms:

- `BlueprintTargetNode`, `BlueprintAttachedModuleNode`, `Plan`

In code:

- `Blueprint`, `BlueprintTargetNode`, `BlueprintAttachedModuleNode`, `BlueprintFailure`

### Plan

Definition:
A repository-aware change model for one snapshot, with concrete outcomes and explicit conflicts.

Invariants:

- Plan is bound to repository reality (`RepoSnapshot`).
- Outcomes are typed as `complete`, `partial`, or `composed`.
- Conflicts are first-class entries, not side notes.

Connected terms:

- `RepoSnapshot`, `RequiredStructure`, `Apply`, `ApplyDecision`

In code:

- `Plan`, `PlanFailure`

### Apply

Definition:
Execution intent formed by one `Plan` and per-path conflict decisions.

Invariants:

- Apply always carries exactly one plan instance.
- Decisions are path-based and currently only `override` or `skip`.
- Execution may fail with `ApplyFailure` reasons.

Connected terms:

- `ApplyDecision`, `ApplyResult`, `Plan`

In code:

- `Apply`, `ApplyDecision`, `ApplyFailure`

### ApplyResult

Definition:
Structured execution result listing created, modified, skipped, and failed paths.

Invariants:

- Failed entries carry path + reason details.
- Result values are report-ready, not planning intent.

Connected terms:

- `Apply`, `FinalizeReport`

In code:

- `ApplyResult`, `ApplyFailedPath`

### FinalizeReport

Definition:
Structured result of finalize-phase commands after apply execution.

Invariants:

- Every finalize entry captures label, command, workdir, status, and optional error.
- Success and failure counts are derived from per-entry status.

Connected terms:

- `ApplyResult`, `ScriptDefinition`

In code:

- `FinalizeReport`

## Definition-Space Terms

### TargetDefinition

Definition:
Catalog entity that describes a scaffoldable target kind and base contributions.

Invariants:

- Identity is `kind`.
- Includes contributions and optional scripts.

Connected terms:

- `TargetKind`, `DesiredContributions`, `ScriptDefinition`

In code:

- `TargetDefinition`

### ModuleDefinition

Definition:
Catalog entity that describes attachable capability, compatibility, dependencies, and contributions.

Invariants:

- Identity is `id: ModuleId`.
- Compatibility is declared via `SupportedOn` rules.
- Dependencies can require a target, a module attachment, or both.

Connected terms:

- `ModuleId`, `SupportedOn`, `DesiredContributions`, `ModuleImplication`

In code:

- `ModuleDefinition`

## Resolution-Space Terms

### BlueprintTargetNode

Definition:
A concrete target node in a blueprint closure.

Invariants:

- Node ID is a `TargetKey`.
- Carries full target identity.

Connected terms:

- `TargetIdentity`, `TargetKey`, `Blueprint`

In code:

- `BlueprintTargetNode`

### BlueprintAttachedModuleNode

Definition:
A resolved module attachment node owned by a blueprint target node.

Invariants:

- Node ID shape is `TargetKey#ModuleId`.
- Each node links to exactly one owning `targetId`.

Connected terms:

- `BlueprintTargetNode`, `ModuleId`, `Blueprint`

In code:

- `BlueprintAttachedModuleNode`, `toAttachedModuleNodeId`

## Identity and Compatibility Terms

### TargetIdentity

Definition:
Canonical target identity value `{ kind, name }` with behavior for keys, paths, and compatibility matching.

Invariants:

- `toKey()` and `toPath()` are deterministic from identity fields.
- `matches()` checks either kind-level or exact-identity support rules.

Connected terms:

- `TargetKind`, `TargetPath`, `TargetKey`, `SupportedOn`

In code:

- `TargetIdentity`

### TargetKind

Definition:
Target category used for identity and compatibility checks.

Invariants:

- Built-in kinds include `init` and `package`.
- Additional kinds are supported as branded strings.

Connected terms:

- `TargetIdentity`, `SupportedOn`, `TargetDefinition`

In code:

- `TargetKind`

### TargetPath

Definition:
Canonical repository location for a target.

Invariants:

- Path meaning is filesystem location.
- Path can equal key string in practice, but the role is different.

Connected terms:

- `TargetIdentity`, `TargetKey`

In code:

- `TargetPath`

### TargetKey

Definition:
Canonical lookup/address key for target identity and graph nodes.

Invariants:

- Key meaning is identity address, not filesystem semantics.
- Key is used as target-node identity in blueprint.

Connected terms:

- `TargetIdentity`, `TargetPath`, `BlueprintTargetNode`

In code:

- `TargetKey`

### ModuleId

Definition:
Canonical module identifier used across catalog, selection, and blueprint attachment IDs.

Invariants:

- Module identity is stable and branded.

Connected terms:

- `ModuleDefinition`, `Selection`, `BlueprintAttachedModuleNode`

In code:

- `ModuleId`

### SupportedOn

Definition:
Compatibility rule describing where a module may attach.

Invariants:

- Rule shape is either `kind` or exact `identity`.
- Matching uses `TargetIdentity.matches(...)`.

Connected terms:

- `ModuleDefinition`, `TargetIdentity`, `TargetKind`

In code:

- `SupportedOn`

## Contribution and Execution Input Terms

### DesiredContributions

Definition:
Declarative desired repository state from targets/modules.

Invariants:

- Contribution buckets include files, exports, dependencies, scripts, barrel exports, and tsconfigs.
- Values are declarative intent, not direct apply results.

Connected terms:

- `TargetContribution`, `ModuleContribution`, `Plan`

In code:

- `DesiredContributions`

### TargetContribution

Definition:
Target-scoped contribution value keyed by target key.

Invariants:

- One contribution payload is tied to one target key.

Connected terms:

- `DesiredContributions`, `TargetKey`

In code:

- `TargetContribution`

### ModuleContribution

Definition:
Module-scoped contribution value keyed by target key and module id.

Invariants:

- Captures overlay intent for one module on one target.

Connected terms:

- `DesiredContributions`, `TargetContribution`, `ModuleId`

In code:

- `ModuleContribution`

### ContributionTokenContext

Definition:
Token-resolution context used when templating contribution contents.

Invariants:

- Includes target identity fields plus runtime, package manager, and project name inputs.

Connected terms:

- `DesiredContributions`, `StackConfig`

In code:

- `ContributionTokenContext`

### StackConfig

Definition:
Run-level configuration for runtime and toolchain choices.

Invariants:

- Runtime is `bun` or `node` with `pnpm|npm`.
- Helper behavior derives runtime and package manager names from runtime shape.

Connected terms:

- `Selection`, `ContributionTokenContext`

In code:

- `StackConfig`, `Runtime`

## Planning and Conflict Terms

### RepoSnapshot

Definition:
Captured repository state used as planning input.

Invariants:

- Path entries are explicitly tagged as missing, directory, or file.

Connected terms:

- `Plan`

In code:

- `RepoSnapshot`

### RequiredStructure

Definition:
Structural requirements for partial/composed plan outcomes.

Invariants:

- May contain exports, dependencies, scripts, and re-export requirements.
- Used when full file replacement is not the right shape.

Connected terms:

- `Plan`

In code:

- `RequiredStructure`

### ApplyDecision

Definition:
Per-path conflict policy used at apply time.

Invariants:

- Decision values are constrained to `override` or `skip`.

Connected terms:

- `Plan`, `Apply`

In code:

- `ApplyDecision`

## Distinctions We Protect

- `Selection` is user intent; `Blueprint` is resolved implication.
- `Blueprint` is dependency closure; `Plan` is repository-aware change projection.
- `TargetIdentity`, `TargetKey`, and `TargetPath` are related but not interchangeable.
- `Catalog` is reference data, not mutable runtime state.
