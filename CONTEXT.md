# Project Scaffold Domain

This context defines the domain language for selection, blueprint resolution, and plan generation in the scaffold workflow. It exists to keep `@repo/domain` as the single source of truth for the implementation model.

## Language

**Blueprint**:
The single canonical resolved model of scaffold structure produced from a `Selection` and consumed by planning.
_Avoid_: PlanBlueprint, normalized blueprint, prototype blueprint

**RepoSnapshot**:
The observed filesystem state of a repository at planning time.
_Avoid_: blueprint state, plan state

**Plan**:
The result of comparing a **Blueprint** against a **RepoSnapshot** to determine required file and merge actions.
_Avoid_: resolved blueprint, enriched blueprint

**Structural Blueprint**:
A **Blueprint** that describes scaffold structure and dependencies, not concrete file contents.
_Avoid_: file-intent blueprint, authored blueprint

**BlueprintCause**:
The canonical reason a node exists in the resolved dependency graph.
_Avoid_: plan cause, file cause

**PlanCause**:
The planning-specific explanation for why a file, directory, or merge action appears in a **Plan**, derived from a **BlueprintCause** and blueprint structure.
_Avoid_: canonical cause, blueprint cause

**Target ID**:
The canonical identifier of a target in a **Blueprint**, stored as `target.id` and used as the primary planning key.
_Avoid_: prototype target ID, remapped target ID

**Target Composition**:
The canonical composition data attached directly to a target in the domain **Blueprint** and consumed directly by planning.
_Avoid_: planning composition model, remapped composition

**Repo Module**:
A repository-wide capability selected into a **Blueprint** through `Blueprint.modules` and used by planning to project repo-level artifacts.
_Avoid_: separate bootstrap concept

**RepoSnapshot**:
The canonical planning input that describes observed repository state, independent of how that state was loaded.
_Avoid_: filesystem loader, scaffold-only snapshot

**Planning Error**:
A lean, actionable domain error that describes why planning could not proceed and can be handled by applications or shown to users.
_Avoid_: generic exception, opaque runtime error

**PlanFailure**:
A generic planning error used when callers only need a clear domain failure message rather than branching behavior.
_Avoid_: over-specified variant, runtime exception

**Cause Translation**:
The canonical domain rule set that projects a **BlueprintCause** into one or more **PlanCause** values for planning.
_Avoid_: planner-local cause mapping, ad hoc translation

**File Projection Rule**:
An implementation-level rule that maps canonical domain structure into concrete repository files, paths, and file contents.
_Avoid_: domain model, canonical domain rule

**Blueprint Review Step**:
An application step between blueprint resolution and planning where the resolved **Blueprint** may be inspected, logged, or approved.
_Avoid_: implicit planning resolution

**Planning Entrypoint**:
The single supported application-level operation for producing a **Plan** from a resolved **Blueprint** and repository state.
_Avoid_: multiple public planning workflows

**Planning Support Model**:
A canonical planning input or error concept that belongs in the existing `Blueprint` or `Plan` domain modules rather than a separate planning-only domain module.
_Avoid_: `ScaffoldPlan` module, parallel planning model

## Relationships

- A **Selection** resolves into exactly one **Blueprint**
- A **Blueprint** may pass through one **Blueprint Review Step** before planning
- A **Blueprint** combined with one **RepoSnapshot** produces exactly one **Plan**
- Applications invoke planning through exactly one **Planning Entrypoint**
- A **Blueprint** does not directly store authored file contents
- A **BlueprintCause** may be projected into one or more **PlanCause** values during planning
- **Cause Translation** is owned by the domain and reused by planning
- **File Projection Rule** is owned by the implementation layer and consumes domain models
- A **Plan** identifies targets by **Target ID**, not by remapped aliases
- A **Plan** reads **Target Composition** directly from the **Blueprint** rather than through a second planning-specific composition model
- `root-bootstrap` is a **Repo Module** and root bootstrap files are projected from that module during planning
- A **RepoSnapshot** is canonical domain input, while snapshot loading is an infrastructure concern outside the domain model
- Planning failures are expressed as **Planning Error** values in the domain model and may be surfaced directly by applications
- A **PlanFailure** is used when no branching application behavior depends on the error variant
- `BlueprintService` resolves **Selection** into **Blueprint** and `PlanService` consumes the resolved **Blueprint** rather than re-resolving it
- **Planning Support Model** concepts are merged into the canonical `Blueprint` and `Plan` modules rather than a separate planning module
- **RepoSnapshot** belongs to the `Plan` domain module because it is planning input rather than blueprint structure
- **Cause Translation** belongs to the `Plan` domain module because it produces planning semantics from blueprint semantics

## Example dialogue

> **Dev:** "Should planning use a normalized blueprint separate from the resolved blueprint?"
> **Domain expert:** "No. **Blueprint** is the only resolved model. Planning must consume it directly."

## Flagged ambiguities

- "normalizedBlueprint" and "PlanBlueprint" were used to mean a second resolved blueprint shape. Resolved: both are aliases to avoid; **Blueprint** is the only canonical model.
- "Blueprint" was at risk of absorbing repo-specific planning state. Resolved: **Blueprint** stays repository-independent; **Plan** carries repo comparison results.
- "intents" implied authored file content was part of **Blueprint**. Resolved: current **Blueprint** is structural only; file-content intent is not a canonical domain concept at this time.
- "cause" was overloaded between dependency-graph reasoning and file-planning reasoning. Resolved: use **BlueprintCause** for graph resolution and **PlanCause** for planning output.
- Target identifiers were being remapped during planning (`packages/domain -> package/domain`, `apps/server-api -> app/server`). Resolved: planning must use canonical **Target ID** from the **Blueprint**.
- Composition was being rewritten into a planning-specific `slot/value/causes` structure. Resolved: planning must consume canonical **Target Composition** directly from the domain **Blueprint**.
- Root bootstrap could have become a separate domain concept. Resolved: keep `root-bootstrap` as a **Repo Module**; planning derives root bootstrap files from that module.
- `RepoSnapshot` could have been treated as a scaffold-local loader concern. Resolved: the snapshot model is canonical domain input; only snapshot acquisition is infrastructure-specific.
- Planning errors could have remained ad hoc `Error` subclasses. Resolved: planning uses lean, actionable **Planning Error** domain values that applications can react to or present to users.
- Cause mapping could have remained buried in the planner. Resolved: **Cause Translation** belongs to the domain as canonical shared behavior.
- Concrete file-path and file-content projection could have moved into the domain. Resolved: **File Projection Rule** stays in implementation code and consumes canonical domain models.
- Planning could have absorbed blueprint resolution. Resolved: preserve the split so a **Blueprint** can be reviewed in a **Blueprint Review Step** between services.
- Low-level planning helpers could have become alternate supported APIs. Resolved: applications use one **Planning Entrypoint**; lower-level functions remain implementation details.
- `ScaffoldPlan` could have remained as a separate domain module. Resolved: remove it and merge surviving planning support concepts into `Blueprint` and `Plan` appropriately.
- `RepoSnapshot` could have been merged into `Blueprint`. Resolved: it belongs with `Plan` because it participates only in planning, not blueprint resolution.
- Cause translation helpers could have lived outside `Plan`. Resolved: place them in `Plan` because they derive `PlanCause` from blueprint-side inputs.
- Planning errors could have been either fully granular or fully generic. Resolved: split into variants only when callers need branching behavior; otherwise use a generic **PlanFailure** domain error.
