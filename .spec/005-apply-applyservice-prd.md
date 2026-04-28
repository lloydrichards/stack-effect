# PRD: Apply Execution Intent and ApplyService

## Problem Statement

As a scaffold user, I can currently generate a `Plan` that explains what should happen, but I cannot execute that plan through a first-class domain boundary. The flow stops at planning, which leaves a gap between intent and repository mutation.

When conflicts are classified as `needsMergeStrategy`, users must make explicit decisions (`override` or `skip`) per conflicted file. Today, that decision model is not represented as a dedicated execution intent, and there is no canonical service boundary that validates those decisions and applies changes safely.

From the user perspective, this creates uncertainty: I can inspect a plan, but I do not have one reliable operation that executes exactly what I confirmed.

## Solution

Introduce an `Apply` domain type as the canonical execution intent and implement an `ApplyService` that materializes repository changes from that intent.

- `Apply` embeds the `Plan` it executes.
- `Apply` carries per-path `Apply Decisions` for conflicted paths only.
- `ApplyService` receives `Apply` plus runtime context (`repoRoot`) and returns a structured `ApplyResult`.
- Invalid execution intents fail fast before writes.
- Execution is deterministic and policy-driven: unchanged files are untouched, create/modify outcomes are applied, conflicted outcomes honor user decisions.

This gives users a clear, trusted sequence: review plan, choose conflict decisions, execute once.

## User Stories

1. As a CLI user, I want to execute a planned scaffold change in one command, so that I can move from planning to implementation without manual file editing.
2. As a CLI user, I want my confirmed conflict decisions to be the only policy used during apply, so that execution matches what I selected.
3. As a CLI user, I want unresolved conflicts to block execution, so that no ambiguous changes are applied silently.
4. As a CLI user, I want extra or stale conflict decisions to be rejected, so that I know my input matches the current plan.
5. As a CLI user, I want unchanged outcomes to produce no writes, so that apply is minimal and predictable.
6. As a CLI user, I want create outcomes to write missing files, so that new scaffolded assets appear automatically.
7. As a CLI user, I want modify outcomes to update files deterministically, so that planned changes land exactly once.
8. As a CLI user, I want conflicted authoritative files to support `override`, so that I can intentionally replace drifted scaffold-owned files.
9. As a CLI user, I want conflicted authoritative files to support `skip`, so that I can preserve local customizations.
10. As a CLI user, I want conflicted structural outcomes to support `override`, so that required structure is enforced even when conflicts exist.
11. As a CLI user, I want conflicted structural outcomes to support `skip`, so that I can postpone risky merges.
12. As a CLI user, I want an apply report that lists what was written and what was skipped, so that I can audit the result quickly.
13. As a CLI user, I want apply failures to stop with actionable errors, so that I can fix input or repo state and retry safely.
14. As a CLI user, I want repository root to come from runtime CLI/UI context, so that execution can target any workspace path.
15. As a CLI user, I want cancel/abort to remain a UI action before execution, so that domain execution stays focused on confirmed intents.
16. As a scaffold maintainer, I want `Apply` to embed `Plan`, so that execution intent cannot drift from the plan it was reviewed against.
17. As a scaffold maintainer, I want decision keys to be planned file paths, so that decision payloads are simple and stable.
18. As a scaffold maintainer, I want duplicate decisions for the same path rejected, so that intent validation is deterministic.
19. As a scaffold maintainer, I want apply validation centralized, so that callers cannot bypass required constraints.
20. As a scaffold maintainer, I want execution to be idempotent for unchanged repositories, so that reruns are safe.
21. As a scaffold maintainer, I want structural merge behavior encapsulated behind deep modules, so that file-kind-specific logic does not leak across services.
22. As a scaffold maintainer, I want package manifest merge behavior deterministic, so that exports/dependencies/scripts remain coherent.
23. As a scaffold maintainer, I want barrel export merge behavior deterministic, so that entrypoint exposure remains stable.
24. As a scaffold maintainer, I want authoritative writes and structural writes to share one orchestration boundary, so that behavior is consistent across file kinds.
25. As a scaffold maintainer, I want write operations to be atomic per file, so that partial file corruption risk is minimized.
26. As a scaffold maintainer, I want write ordering to be deterministic, so that debugging and snapshots are repeatable.
27. As a scaffold maintainer, I want apply to fail if filesystem shape assumptions are violated, so that invalid repo states are surfaced early.
28. As a scaffold maintainer, I want clear separation between planning and execution responsibilities, so that each service has one stable purpose.
29. As a scaffold maintainer, I want domain language to remain aligned with `CONTEXT.md`, so that design and implementation stay consistent.
30. As an automation user, I want apply behavior independent from git patch tooling, so that execution works consistently in any repository state that satisfies plan assumptions.
31. As an automation user, I want machine-readable apply results, so that CI and bots can branch on outcome counts and failures.
32. As an automation user, I want conflict handling to require explicit decisions, so that non-interactive runs cannot accidentally override local changes.
33. As an internal platform user, I want the same apply intent usable from CLI and future UI, so that behavior does not diverge between surfaces.
34. As a tester, I want to test apply through observable filesystem outcomes, so that tests remain stable through internal refactors.
35. As a tester, I want fixtures where conflicts are resolved by override or skip, so that both decision branches are validated.
36. As a tester, I want invalid apply intent cases to be covered, so that guardrails remain trustworthy over time.
37. As a tester, I want integration tests that start from real `Plan` outputs, so that end-to-end scaffold behavior is validated.
38. As a future contributor, I want deep execution modules with small interfaces, so that new file-kind handlers can be added without rewriting orchestration.
39. As a future contributor, I want failure reasons grouped by validation vs execution, so that troubleshooting is fast.
40. As a future contributor, I want apply behavior documented as domain contracts, so that future UI and API designs reuse the same semantics.

## Implementation Decisions

- Introduce `Apply` as a domain execution intent that embeds a `Plan` and a decision set.
- Keep repository root outside `Apply`; it is runtime execution context supplied to `ApplyService`.
- Model `Apply Decision` values as `override | skip`.
- Key decisions by planned file path.
- Restrict decisions to conflicted outcomes only (`needsMergeStrategy`).
- Reject an `Apply` intent if any conflicted path is missing a decision.
- Reject an `Apply` intent if any decision targets a non-conflicted path.
- Reject duplicate decisions for the same path.
- Keep `abort` outside the domain model as a UI cancellation action.
- Add `ApplyService` as the single execution boundary that materializes changes from `Apply`.
- Add an `ApplyResult` contract that reports created, modified, unchanged, skipped, and failed outcomes at path granularity.
- Keep plan derivation responsibility in `PlanService`; `ApplyService` does not recompute planning intent.
- Keep authoritative and structural execution paths under one orchestrator.
- Implement deep module boundaries to avoid shallow utility spread:
- `ApplyIntentValidator` deep module for all invariants on `Apply` payloads.
- `PlannedOutcomeMaterializer` deep module that derives concrete write/no-write actions from outcome classification plus decisions.
- `StructuralOutcomeMerger` deep module that encapsulates file-kind-specific structural merge logic.
- `ApplyWriteEngine` deep module that performs deterministic, atomic file writes and reports write results.
- Favor direct filesystem execution as the source of truth rather than git patch application as the primary mutation mechanism.
- Keep optional preview/diff generation as a presentation concern, not the core execution mechanism.
- Preserve existing plan classification semantics (`create`, `modify`, `unchanged`, `needsMergeStrategy`) as apply inputs.
- Ensure apply execution order is deterministic by path to improve reproducibility and debugging.
- Keep failure taxonomy explicit: intent-validation failures vs execution failures.

## Testing Decisions

- Good tests assert external behavior and contracts: validated intent, resulting filesystem state, and structured apply results.
- Good tests do not assert internal helper composition, intermediate records, or ordering details that are not contractual.
- Test `ApplyIntentValidator` with valid and invalid intents, including missing decisions, extra decisions, and duplicate path decisions.
- Test `PlannedOutcomeMaterializer` for each classification and decision branch, including no-op behavior for unchanged outcomes.
- Test `StructuralOutcomeMerger` with representative package manifest and barrel scenarios, covering merge success and conflict-policy behavior.
- Test `ApplyWriteEngine` behavior around deterministic writes, atomicity guarantees per file, and error surfacing.
- Test `ApplyService` at boundary level: complete apply flow, mixed outcome plans, skip branches, override branches, and fail-fast invalid intents.
- Add integration tests that build `Plan` through existing planning flow and then execute apply to verify end-to-end behavior.
- Validate idempotency with repeated apply runs on an already-applied repository state.
- Prior art: existing boundary-focused tests around planning classification, conflict detection, and repository snapshot abstraction.

## Out of Scope

- UI design and interactions for radio groups, confirmation controls, or cancellation flows.
- Modeling `abort` or confirmation state inside domain schemas.
- Replacing planning logic or changing `PlanService` classification semantics.
- Introducing git patch generation/application as the primary write path.
- Three-way merge tooling, interactive merge conflict markers, or generic text diff engines.
- Parallel/distributed apply execution across multiple repositories.
- Post-apply git operations (automatic commit, branch, or PR creation).
- Full transactional rollback across all files after partial execution failure.
- New module/target catalog semantics unrelated to apply execution.

## Further Notes

- This PRD formalizes the next domain step after planning: converting a reviewed plan into a validated execution intent.
- The design intentionally keeps planning and execution separate while making the execution boundary explicit and testable.
- Domain language and invariants are aligned with current `CONTEXT.md` decisions.
- The implementation should prioritize deep modules with stable interfaces to keep the apply system maintainable as new file-kind handlers are introduced.
