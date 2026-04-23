# PRD: Simplify Plan and Deepen PlanService Around Planned File Outcomes

## Problem Statement

The current planning model is harder to understand than it needs to be. `PlanService` carries multiple internal representations of the same concept, and the public `Plan` boundary stores both canonical planning data and pre-rendered navigation structure. As a result, the planner feels over-engineered, the core concept is obscured, and tests defend intermediate shapes instead of stable behavior.

From a developer's perspective, the planning question should be simple: given a resolved `Blueprint` and the current repository state, what file outcomes are required and where are the conflicts? Instead, understanding that answer requires bouncing between contribution resolution, projected path collection, changeset assembly, merge classification, directory derivation, and presentation concerns.

The current model also exposes too little of what actually matters. A file path may be marked `create`, `modify`, `unchanged`, or `needsMergeStrategy`, but the plan does not treat the desired file outcome as the central public concept. That makes the result feel more like a report of planner activity than a canonical planning artifact.

## Solution

Refactor planning around one canonical concept: the **Planned File Outcome**.

- `Plan` becomes the canonical model of planned file outcomes and conflicts.
- `Plan` is file-only. Directories and tree views are derived presentations rather than first-class planned outcomes.
- Each planned file path has one canonical planned file outcome that includes both classification and desired outcome.
- Planned file outcomes are split into two domain kinds: **Authoritative File Outcome** and **Structural Merge Outcome**.
- `tsconfig.json` is treated as an authoritative file outcome because scaffold usually adds it once and treats later drift as conflict.
- Structural merge outcomes expose required structure at the public boundary, not planner merge-strategy names.
- `PlanService` remains the one planning boundary. It owns both desired-outcome resolution from a `Blueprint` and comparison against the current repository snapshot.
- `PlanService` exposes one public planning operation from `Blueprint` plus repo root to `Plan`.
- Internal planner stages are collapsed around a canonical per-path outcome model, with deletion preferred over creating new shallow helper seams.

This keeps the planner centered on the one question callers actually ask while trimming duplicate representations, reducing over-engineering, and making tests target stable planning behavior.

## User Stories

1. As a developer using scaffold planning, I want a `Plan` to describe planned file outcomes directly, so that I can understand what scaffold intends to do without reconstructing intermediate planner stages.
2. As a developer using scaffold planning, I want `Plan` to be the canonical planning artifact, so that downstream tools do not need to rerun planner internals to know the intended repository state.
3. As a developer reading planner output, I want each planned file path to have one canonical outcome, so that I do not need to reconcile duplicate representations of the same change.
4. As a developer reading planner output, I want directories to be derived rather than first-class planned outcomes, so that the plan stays focused on meaningful file changes.
5. As a developer building a CLI or UI on top of planning, I want tree and directory views to be derived from canonical file outcomes, so that presentation needs do not distort the domain model.
6. As a developer working on scaffold internals, I want the planner centered on per-path outcomes, so that the implementation matches the actual unit of planning.
7. As a developer working on scaffold internals, I want to remove redundant internal representations, so that planning logic is easier to follow and cheaper to refactor.
8. As a developer working on scaffold internals, I want desired file state to be part of the public plan result, so that a plan is useful for explanation, application, and future tooling.
9. As a developer working on scaffold internals, I want classifications such as `create`, `modify`, `unchanged`, and `needsMergeStrategy` to remain visible, so that the planner still communicates outcome status clearly.
10. As a developer working on scaffold internals, I want classification to sit alongside desired outcome rather than replace it, so that the public model reflects both intent and status.
11. As a developer planning a target from scratch, I want authoritative file outcomes for normal scaffolded files, so that the planner can express exact desired contents when scaffold owns the whole file.
12. As a developer planning changes into an existing workspace, I want structural merge outcomes for mergeable files, so that the planner can express required structure without pretending to own the entire file.
13. As a developer working with `package.json`, I want the planner to express the required exports, dependencies, and scripts structurally, so that planner behavior remains path-local and comprehensible.
14. As a developer working with barrel files, I want the planner to express the required public exports structurally, so that merge behavior stays focused on the intended outcome.
15. As a developer working with `tsconfig.json`, I want the planner to treat it as authoritative, so that scaffold establishes one canonical starting point and later drift is surfaced as conflict.
16. As a developer reading planner conflicts, I want conflicts to remain path-local, so that one ambiguous file does not obscure unaffected planned outcomes elsewhere.
17. As a developer reading planner conflicts, I want conflict information attached to the same domain model as planned outcomes, so that conflict reporting stays close to the planned file path it affects.
18. As a developer using scaffold from a service or command, I want one public planning operation, so that planning remains simple to call and hard to misuse.
19. As a developer extending scaffold, I do not want to choose between multiple low-level planner entry points, so that the public boundary stays stable while implementation details change.
20. As a developer testing scaffold planning, I want boundary tests against one planning service, so that tests describe behavior rather than helper choreography.
21. As a developer testing scaffold planning, I want repo inspection hidden behind the planner boundary, so that tests can use local substitutes and assert only on observable planning outcomes.
22. As a developer maintaining the codebase, I want fewer planner-specific staging types, so that naming overhead and navigation friction go down.
23. As a developer maintaining the codebase, I want planning terminology aligned with `CONTEXT.md`, so that domain language stays consistent across schemas, services, and tests.
24. As a developer reading the codebase like an AI would, I want the public plan model to match the real planning concept, so that understanding planning no longer requires bouncing across shallow seams.
25. As a developer adding new contribution types later, I want the planner to preserve the same public outcome model, so that new merge handlers remain implementation details rather than domain rewrites.
26. As a developer evolving the planner, I want deletion preferred over speculative extension points, so that simplifying the codebase remains a first-class goal.
27. As a developer debugging a planning result, I want the desired file outcome visible at the boundary, so that I can tell whether a conflict came from missing ownership, structural mismatch, or authoritative drift.
28. As a developer implementing a future apply step, I want to consume canonical planned file outcomes from `Plan`, so that applying a plan does not depend on replaying planner internals.
29. As a developer implementing a future diff view, I want to render different views from the same canonical plan, so that presentation concerns remain flexible without bloating the domain model.
30. As a developer maintaining tests, I want old tests on internal path collection and duplicate render structures to become unnecessary, so that the suite gets smaller and more durable.
31. As a developer planning across multiple targets and modules, I want `PlanService` to continue owning contribution resolution and repo comparison together, so that one planning request produces one coherent result.
32. As a developer planning from a resolved `Blueprint`, I want planner policy to stay centralized, so that authoritative-file behavior and structural-merge behavior remain consistent across file kinds.

## Implementation Decisions

- `Plan` is redefined as the canonical domain model of planned file outcomes and conflicts.
- `Plan` no longer treats directories or pre-rendered tree structure as first-class planning data.
- Tree, directory, summary, and pretty-print views are derived from canonical file outcomes rather than stored as core domain state.
- The primary public planning unit is a **Planned File Outcome**.
- A planned file outcome includes the planned file path, classification, and desired outcome.
- The planner keeps the existing user-visible classification vocabulary of `create`, `modify`, `unchanged`, and `needsMergeStrategy` unless a separate simplification is chosen later.
- Planned file outcomes split into two domain kinds: **Authoritative File Outcome** and **Structural Merge Outcome**.
- Authoritative file outcomes represent files whose full desired contents are known by scaffold.
- Structural merge outcomes represent files whose required structural result is known without treating the whole file as authoritative.
- `tsconfig.json` is treated as an authoritative file outcome rather than a structural merge outcome.
- `package.json` and barrel-style files remain supported planning cases, but their specific merge handlers are internal implementation details rather than top-level domain concepts.
- Structural merge outcomes expose the required structure at the public boundary, not parser or merge-strategy names.
- `PlanService` remains the single public planning boundary.
- `PlanService` owns both desired-outcome resolution from a `Blueprint` and comparison against the current repository snapshot.
- `PlanService` exposes one public planning operation from `Blueprint` plus repo root to `Plan`.
- Lower-level planning stages remain private implementation details.
- The internal planner should collapse around one canonical per-path outcome model rather than multiple projected-path and changeset staging types.
- Simplification should prefer deletion of redundant types and helpers over extraction of new shallow modules.
- Deep modules are still desirable where they materially simplify the boundary.
- The expected deep modules in the resulting design are:
- a canonical `Plan` domain contract centered on planned file outcomes and conflicts
- a single `PlanService` planning boundary with one stable public operation
- a local-substitutable repo inspection adapter hidden behind the planning boundary
- derived presentation helpers that build tree or summary views from canonical planned file outcomes without redefining the plan model
- Contribution resolution remains part of the planning boundary rather than becoming a separate public API stage.
- Repo inspection remains an implementation dependency of planning rather than a public planning artifact.
- Existing internal projection, aggregation, and render-oriented structures should be removed or collapsed whenever they no longer add domain value.
- The resulting design should optimize for easier code navigation, fewer domain terms, and smaller behavioral seams.

## Testing Decisions

- Good tests assert external behavior and stable contracts rather than internal planner stages, helper function choreography, or render-specific bookkeeping.
- Good planning tests describe what the planner decides for a given blueprint and repository state, not how it collects paths or stores intermediate representations.
- Good domain tests describe the canonical shape and behavior of `Plan`, not redundant navigation structures derived from it.
- The primary test target is `PlanService` as the public planning boundary.
- `PlanService` tests should cover authoritative file outcomes, structural merge outcomes, path-local conflict behavior, and mixed plans where unaffected files continue to classify correctly beside conflicts.
- `PlanService` tests should cover authoritative drift behavior for `tsconfig.json`.
- `PlanService` tests should cover package manifest structural outcomes for exports, dependencies, and scripts.
- `PlanService` tests should cover barrel-style structural outcomes.
- `PlanService` tests should cover invalid repository-shape cases such as file-versus-directory collisions.
- `Plan` domain tests should cover canonical outcome decoding, deterministic ordering where ordering remains part of the contract, and any derived presentation helpers that remain public.
- Repo inspection should be tested indirectly through planning boundary tests wherever possible.
- Thin tests that only verify internal path collection or duplicate directory-entry rendering should be deleted once boundary tests cover the same behavior.
- Prior art exists in the current public planning tests, plan domain tests, and blueprint/planner integration coverage already present in the repo.
- Prior art also shows that some snapshot-loader and intermediate-shape tests can be retired once boundary tests prove the same behavior more directly.
- The refactor should reduce test surface area where tests currently defend over-modeled structures rather than stable outcomes.

## Out of Scope

- Refactoring `Blueprint` beyond what is necessary to keep planning working with the current blueprint boundary.
- Changes to selection semantics, direct-selection provenance, or blueprint graph responsibilities.
- Changes to `Init` responsibilities.
- Introducing a separate public contribution-resolution API.
- Introducing multiple public planner operations.
- Introducing new planner-owned merge policy beyond the current authoritative-versus-structural split already implied by existing behavior.
- Adding a generic diff engine or patch language to the public domain model.
- Making directories first-class planned outcomes again.
- Preserving backward compatibility with the current `Plan` shape if that shape conflicts with the simplified target model.
- Defining the detailed issue slicing or migration sequence for implementing the refactor.
- A future apply command or UI, beyond ensuring the resulting `Plan` can support those consumers cleanly.

## Further Notes

- This PRD is an architectural simplification and domain clarification effort rather than a new end-user product feature.
- The goal is to trim fat aggressively, remove over-engineered representations, and make the planner easier to explain, test, and evolve.
- The language captured in `CONTEXT.md` is part of the intended design and should stay aligned with schemas, services, and tests.
- The implementation should treat current planner internals as disposable if they do not support the simplified domain boundary.
- This PRD is compatible with continuing to use local test substitutes for repo inspection while keeping that seam out of the public planning API.
