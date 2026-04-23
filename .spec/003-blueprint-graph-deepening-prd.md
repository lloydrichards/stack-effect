# PRD: Deepen Blueprint Into a Real Graph Boundary

## Problem Statement

The current scaffold planning flow calls `Blueprint` a dependency graph, but the model does not behave like a real graph boundary. Targets are first-class nodes, while attached modules are nested under targets and only appear in edges through synthetic string IDs. Selection provenance is also mixed into the graph through `roots`, even though the planner and contribution resolver only care about the resolved dependency closure.

This makes the codebase harder to navigate and harder to test. Understanding a single concept requires bouncing between domain schemas, scaffold services, catalogs, and planner tests. The resolver manually rebuilds graph behavior with maps and sets, while downstream consumers do not actually consume the graph as a graph. The result is an over-scaffolded architecture where the public model is shallow and the real complexity lives in seams between modules.

## Solution

Refactor scaffold planning so that `Blueprint` becomes a true, public, domain-owned graph boundary made of `Target` nodes and `Attached Module` nodes. The graph should represent only the resolved dependency closure, without preserving direct-selection provenance. Ownership between a target and its attached modules becomes a real graph edge, and dependency edges remain distinct by meaning.

- `Blueprint` becomes simple graph data with minimal helpers.
- `Blueprint` exposes both target nodes and attached-module nodes publicly.
- Canonical node IDs are introduced for all blueprint nodes.
- `roots` is removed from the public model.
- Selection validation and dependency-closure resolution move into a dedicated resolver module that returns `Blueprint`.
- `BlueprintService` becomes a thin wrapper around that resolver.
- `ContributionResolver` and planning code consume the public graph model instead of a target-with-nested-modules bag shape.
- Effect `Graph` may be used internally if it simplifies traversal, but it is not part of the public domain boundary.

## User Stories

1. As a developer selecting scaffold targets, I want `Blueprint` to represent a real graph, so that the dependency model matches how the system is described.
2. As a developer selecting scaffold targets, I want target and attached-module nodes to both be explicit, so that ownership and dependencies are visible without hidden conventions.
3. As a developer selecting scaffold targets, I want attached modules to belong to exactly one owning target, so that capability instances remain target-scoped.
4. As a developer selecting scaffold targets, I want a reusable module type to be attachable to multiple targets through separate attached-module nodes, so that shared capabilities do not blur target ownership.
5. As a developer selecting scaffold targets, I want target-to-attached-module ownership represented as a real edge, so that the graph can be traversed consistently.
6. As a developer selecting scaffold targets, I want ownership edges and dependency edges to remain distinct, so that the graph preserves domain meaning.
7. As a developer selecting scaffold targets, I want required-target and required-module dependencies to remain distinct even when both point into the same area of the graph, so that workspace existence and capability requirements are not conflated.
8. As a developer selecting scaffold targets, I want both required-target and required-module edges preserved when both are declared, so that the graph remains faithful to module definitions.
9. As a developer selecting scaffold targets, I want `Blueprint` to represent only the resolved dependency closure, so that the graph is minimal and planner-focused.
10. As a developer selecting scaffold targets, I do not want direct-selection provenance stored in `Blueprint`, so that the graph boundary stays focused on closure rather than UI state.
11. As a developer selecting scaffold targets, I want selected and implied targets with the same identity to collapse to the same node, so that resolution produces one canonical graph.
12. As a developer selecting scaffold targets, I want selected and implied attached modules with the same target and module ID to collapse to the same node, so that duplicate capability occurrences are impossible.
13. As a developer reading planner code, I want `Blueprint` node IDs to be canonical and schema-validated, so that graph lookups are simple and consistent.
14. As a developer reading planner code, I want target node IDs to use the canonical target identifier, so that target lookup remains obvious.
15. As a developer reading planner code, I want attached-module node IDs to follow a canonical `TargetKey#ModuleId` format, so that ownership and dependency edges are easy to read and debug.
16. As a developer working in the domain package, I want `Blueprint` to stay simple graph data with minimal helpers, so that the public model remains stable and serializable.
17. As a developer working in the domain package, I do not want a custom query API layered onto `Blueprint`, so that the domain model does not become another shallow wrapper.
18. As a developer working in scaffold services, I want selection validation and dependency resolution to live in one dedicated resolver, so that the main service boundary is deep and easy to test.
19. As a developer working in scaffold services, I want duplicate target selection validation to happen in the resolver, so that callers only see valid blueprint resolution behavior.
20. As a developer working in scaffold services, I want duplicate module selection validation to happen in the resolver, so that invalid selections fail before graph construction leaks outward.
21. As a developer working in scaffold services, I want unsupported target-module combinations validated inside the resolver, so that resolution owns compatibility rules end-to-end.
22. As a developer working in scaffold services, I want option-gating rules validated inside the resolver, so that selection semantics stay in one place.
23. As a developer working in scaffold services, I want dependency closure expansion owned by one dedicated module, so that graph construction does not leak through intermediate mutable state.
24. As a developer working in scaffold services, I want `BlueprintService` to delegate to that resolver, so that the service boundary is thin and stable.
25. As a developer working on contribution resolution, I want to consume `Blueprint` as a graph of target and attached-module nodes, so that contributions are derived from the public domain shape rather than hidden nesting.
26. As a developer working on contribution resolution, I want target contributions and module contributions to continue to be resolved separately, so that ownership rules remain explicit.
27. As a developer working on planning, I want the planner to stay agnostic to selection provenance, so that planning depends only on resolved repository intent.
28. As a developer working on planning, I want boundary tests to assert planning outcomes from a real blueprint graph, so that tests stop reconstructing internal graph conventions by hand.
29. As a developer working on tests, I want blueprint tests to assert observable graph behavior rather than resolver implementation details, so that internal refactors remain cheap.
30. As a developer working on tests, I want the deepest modules to be tested at their public boundary, so that test coverage follows behavior instead of helper functions.
31. As a developer extending the scaffold system, I want module definitions to remain declarative, so that new capabilities can be added without changing graph semantics.
32. As a developer extending the scaffold system, I want the graph model to support one target depending on another target’s attached module, so that cross-target capability relationships are explicit.
33. As a developer extending the scaffold system, I want the graph model to support a target with no attached modules, so that workspace scaffold still exists as a first-class concept.
34. As a developer extending the scaffold system, I want internal traversal strategy to remain swappable, so that the implementation can adopt Effect `Graph` later without changing the public model.
35. As a developer reading the codebase like an AI would, I want graph ownership, dependency semantics, and canonical IDs defined in one coherent model, so that understanding the scaffold domain no longer requires bouncing across multiple shallow seams.

## Implementation Decisions

- `Blueprint` becomes a public graph of two node kinds: `Target` and `Attached Module`.
- `Blueprint` remains a domain-owned schema and simple data boundary.
- `Blueprint` does not preserve direct-selection provenance.
- `roots` is removed from the public `Blueprint` model.
- Selected and implied targets collapse to the same node when they share the same identity.
- Selected and implied attached modules collapse to the same node when they share the same owning target and module ID.
- Ownership from a target to its attached modules is represented as a real graph edge.
- Dependency edges remain distinct from ownership edges.
- The graph distinguishes at least three edge kinds: `owns-module`, `required-target`, and `required-module`.
- When a module definition declares both a required target and a required module, both edges are preserved in the graph.
- A `Module` remains the reusable capability type.
- An `Attached Module` is the per-target occurrence of a module on its owning target.
- A module may appear on multiple targets only through separate attached-module nodes.
- Canonical `Blueprint Node ID` values are introduced as a separate graph concept.
- Target nodes use the canonical target identifier as their node ID.
- Attached-module nodes use a canonical `TargetKey#ModuleId` node ID.
- The target identifier in this context collapses to the same canonical string as the target path.
- Canonical node identifiers should be validated through schema, including use of template-literal schema shapes for attached-module node IDs.
- `Blueprint` stays simple graph data with minimal helpers such as deterministic sorting and graph-oriented pretty printing.
- `Blueprint` should not grow a custom behavioral query API.
- Selection validation and dependency-closure resolution are extracted into a dedicated resolver module.
- The dedicated resolver returns `Blueprint` directly.
- The dedicated resolver owns duplicate selection checks, compatibility checks, option gating, and dependency-closure expansion.
- `BlueprintService` becomes a thin wrapper that delegates to the dedicated resolver.
- `ContributionResolver` must be updated to consume the public graph model instead of target nodes with nested module arrays.
- The planner continues to consume `Blueprint` plus normalized contributions and repo snapshot state.
- The public domain boundary should not expose Effect `Graph` or any other implementation-specific graph engine.
- Internal traversal may use Effect `Graph` if it simplifies implementation, but adopting it is an implementation choice rather than a domain decision.
- The implementation should prefer deep modules that hide graph assembly, validation, and traversal behind stable boundaries.
- The expected deep modules in the resulting design are:
- a dedicated blueprint resolver that converts selection into blueprint graph data
- a domain-owned blueprint schema that defines node and edge contracts
- a contribution resolver that projects target and module contributions from the graph boundary
- the existing planner boundary that compares desired repository state against the repo snapshot

## Testing Decisions

- Good tests should assert external behavior at stable module boundaries rather than intermediate mutable state or helper function internals.
- Good tests should describe what the graph means, not how the resolver happens to build it.
- Good tests should survive internal refactors such as changing maps and sets to Effect `Graph`.
- The dedicated blueprint resolver should be tested directly.
- Resolver tests should cover duplicate target selection failures.
- Resolver tests should cover duplicate module selection failures.
- Resolver tests should cover unsupported target-module combinations.
- Resolver tests should cover option-gated selection failures.
- Resolver tests should cover dependency-closure expansion into target and attached-module nodes.
- Resolver tests should cover ownership edge creation.
- Resolver tests should cover required-target edge creation.
- Resolver tests should cover required-module edge creation.
- Resolver tests should cover preservation of both required-target and required-module edges when both are declared.
- Resolver tests should cover canonical node ID generation for target and attached-module nodes.
- Blueprint domain tests should cover schema shape, deterministic sorting, and graph-oriented pretty printing.
- Contribution resolver tests should be updated to assert contribution projection from the new public graph shape.
- Planner tests should use real blueprint graphs shaped like the public boundary rather than hand-built fixtures that depend on legacy nested target-module structure.
- Prior art exists in the current blueprint service tests, blueprint domain tests, and plan service tests, which already verify resolver failures, graph outputs, and planner behavior at the boundary.
- The primary test focus should be the dedicated blueprint resolver, the blueprint domain model, the contribution resolver, and the planner boundary.

## Out of Scope

- Preserving backward compatibility with the current `Blueprint` schema.
- Preserving `roots` or any other direct-selection provenance inside `Blueprint`.
- Introducing a rich query API on the public `Blueprint` boundary.
- Modeling module definitions as shared graph nodes across multiple targets.
- Changing the planner to become provenance-aware.
- Introducing new module compatibility shapes beyond the existing supported target kind and exact target identity rules.
- Introducing arbitrary contribution-generation logic.
- Cross-target file writes from a single module contribution.
- A final decision to adopt Effect `Graph` immediately in the first implementation step.
- Detailed migration sequencing or issue slicing.

## Further Notes

- This PRD is a refactor and architectural clarification, not a user-facing product feature.
- The goal is to remove architectural friction in the scaffold/domain boundary, especially where the current graph model is only partially graph-shaped.
- The glossary and decisions captured in `CONTEXT.md` are part of the intended design and should be kept aligned with implementation changes.
- Existing simplification work around Blueprint and Plan should be reconciled with this PRD, especially where it still assumes `roots`-based provenance or nested target-module graph shapes.
