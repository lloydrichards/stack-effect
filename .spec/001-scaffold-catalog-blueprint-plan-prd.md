# PRD: Refine Scaffold Catalog, Blueprint, and Plan Around Targets and Modules

## Problem Statement

The current scaffold model splits responsibility in a way that makes the system hard to understand and hard to evolve. Catalog and registry data describe some dependency relationships, but `PlanService` still hardcodes much of the real output model through target-specific branching. Repo bootstrap concerns are also mixed into Blueprint and Plan through `root-bootstrap`, which weakens the meaning of target selection and makes the dependency graph noisier than it needs to be.

The result is an unclear boundary between selection, dependency resolution, contribution lookup, and planning. It is difficult to answer simple questions such as which target or module is responsible for a file change, how dependencies should be shown to a user, and where the single source of truth for generated outputs should live.

## Solution

Refine the scaffold model around two core concepts: **Targets** and **Modules**.

- A **Target** is a concrete workspace in the repository.
- A **Module** is a capability attached to a compatible target.
- `Init` becomes a separate process that prepares repo-wide substrate and stays out of the Blueprint to Plan flow.
- `Blueprint` becomes a graph-only model that resolves selected targets, attached modules, and dependency edges.
- `TargetCatalog` and `ModuleCatalog` become the source of truth for desired contributions.
- `Plan` resolves and normalizes those contributions after Blueprint, then compares them against the repo snapshot using shared planner policy.

This keeps dependency resolution, contribution lookup, and merge policy separate. It also makes the graph easier to explain and the planner easier to extend.

## User Stories

1. As a developer using scaffold selection, I want to select a target and its modules, so that I can describe the workspace capabilities I need without thinking about internal file generation rules.
2. As a developer using scaffold selection, I want implied target and module dependencies to be resolved automatically, so that valid configurations can be constructed from a small input.
3. As a developer using scaffold selection, I want dependencies between targets and modules to be explicit in Blueprint, so that I can understand why extra workspaces or capabilities appear.
4. As a developer using scaffold selection, I want repo bootstrap concerns handled outside Blueprint and Plan, so that target planning focuses only on workspace changes.
5. As a developer selecting `server` with an API module, I want the required domain target and domain API module to be implied automatically, so that cross-target dependencies are correct by default.
6. As a developer selecting a bare target with no modules, I want the target scaffold to still be planned, so that a workspace can exist before capabilities are added.
7. As a developer, I want module compatibility rules to be visible in data, so that I can see which modules are valid for which targets without reading arbitrary code.
8. As a developer, I want module compatibility to support target kind and exact target identity, so that common and special-case modules can both be modeled clearly.
9. As a developer, I want target paths to be derived from target identity, so that selections stay semantic and consistent with repo conventions.
10. As a developer, I want target dependencies to reference target identity rather than paths, so that dependency data stays stable if path conventions or key formats change.
11. As a developer, I want target and module contributions declared in catalog data, so that the planner no longer depends on target-specific branching.
12. As a developer, I want contributions to declare only desired repository state, so that merge and conflict behavior stays uniform and planner-owned.
13. As a developer, I want contribution paths to use a small token system, so that one target or module definition can be reused across many concrete target instances.
14. As a developer, I want cross-target effects to be modeled through dependencies, so that one module never silently writes into another target's files.
15. As a developer, I want public package entrypoints expressed as contributions, so that published outputs are modeled directly instead of through an abstract composition layer.
16. As a developer working on the planner, I want Blueprint to stay graph-only, so that dependency resolution and contribution planning remain separate concerns.
17. As a developer working on catalogs, I want a single source of truth for target and module outputs, so that I can add new scaffold capabilities without editing planner branches.
18. As a developer reading planner output, I want file changes to be traceable to normalized target and module contributions, so that planned changes are understandable and debuggable.
19. As a developer extending the system, I want deep modules around blueprint resolution, contribution resolution, and planning, so that each concern can be tested in isolation.
20. As a developer maintaining the repo, I want the scaffold domain language to distinguish identity, path, and key, so that graph semantics and file system semantics do not get mixed together.

## Implementation Decisions

- The model is centered on **Targets** and **Modules**.
- A **Target** is a concrete workspace with semantic identity, derived path, and canonical graph key.
- A **Module** is a capability attached to a compatible target and identified globally by module ID.
- Repo bootstrap is removed from Blueprint and Plan. `Init` becomes a separate process that prepares repo substrate only.
- `Init` owns stable repo-wide infrastructure such as root config and shared top-level substrate. It does not create application or package targets.
- Blueprint remains a resolved dependency graph. It does not carry normalized file contributions.
- Plan consumes Blueprint plus catalog data and repo snapshot state.
- Module dependencies remain split into **Required Target** and **Required Module**. These are distinct dependency types and both are first-class.
- Dependency declarations reference **Target Identity** rather than target path or target key.
- Target path is derived centrally from target identity using repo conventions.
- The current repo convention is preserved: package targets resolve to `packages/{name}` and non-package targets resolve to `apps/{kind}-{name}`.
- Target identity, target path, and target key are separate concepts and should remain separate in the schema.
- Both targets and modules contribute desired repository state.
- **Target Contributions** describe base workspace scaffold.
- **Module Contributions** describe capability-specific overlays.
- A module may contribute only to its owning target.
- Cross-target effects are expressed through explicit dependencies that cause the dependent target and module to contribute their own outputs.
- Contribution data is declarative and static.
- Contribution data may use a small explicit token set resolved against target context.
- The initial token model should include target-scoped values such as target directory, target name, and target kind.
- Contributions express only desired outcomes. They do not encode merge instructions or conflict policy.
- Planner policy stays centralized in Plan.
- Public package entrypoints are modeled as direct contributions rather than as a separate composition concept.
- Module compatibility becomes declarative `supportedOn` data rather than executable `isSupported` predicates.
- `supportedOn` supports only two shapes for now: target kind and exact target identity.
- The PRD assumes breaking changes are acceptable. It describes the ideal end-state model rather than a migration strategy.
- The implementation should be organized around a small set of deep modules:
- `TargetCatalog` owns target definitions, target contributions, and target path derivation rules.
- `ModuleCatalog` owns module definitions, module compatibility, module dependencies, and module contributions.
- `BlueprintResolver` owns dependency resolution from selection to graph.
- `ContributionResolver` owns lookup and token resolution from Blueprint to normalized desired contributions.
- `PlanService` owns comparison against repo state and shared merge and conflict policy.
- `InitService` owns repo substrate setup outside the Blueprint to Plan flow.

## Testing Decisions

- Good tests should verify external behavior and stable contracts, not internal implementation details.
- Good Blueprint tests should assert the resolved graph structure: targets, attached modules, dependency edges, and derived implications from a selection.
- Good contribution tests should assert normalized desired contributions from a given Blueprint and catalog state, including token resolution and contribution ownership.
- Good planning tests should assert file classifications, merge behavior, and conflict outcomes against representative repo snapshots.
- `BlueprintResolver` should have focused tests around target selection, implied dependencies, unsupported module combinations, and dependency edge formation.
- `ContributionResolver` should have focused tests around target contributions, module contributions, token resolution, public entrypoint outputs, and the rule that modules contribute only to their owning target.
- `PlanService` should have focused tests around planner policy, including authoritative files, package manifest merges, barrel export merges, tsconfig handling, and conflict detection.
- `TargetCatalog` and `ModuleCatalog` should have schema-level tests that validate path derivation, compatibility matching, dependency declarations, and contribution normalization inputs.
- Prior art exists in the current Blueprint and Plan test suites, which already exercise dependency resolution and planner outcomes. Those suites can inform the shape of the new external-behavior tests even if the internal schema changes.

## Out of Scope

- A migration plan from the current implementation to the target model
- Backward compatibility with the current schema or current planner internals
- A custom rule language for compatibility beyond target kind and exact target identity
- Arbitrary code execution in contribution generation
- Cross-target writes from a single module contribution
- Repo bootstrap concerns inside Blueprint or Plan
- Detailed implementation task breakdown or issue slicing

## Further Notes

- This PRD should be treated as the intended end-state architecture for scaffold planning.
- The existing simplification work around Blueprint and Plan should be reconciled with this model before implementation starts, especially where it overlaps with graph shape and responsibility boundaries.
- The glossary captured in `CONTEXT.md` is part of the design. Implementation should use that language consistently in schemas, services, and tests.
