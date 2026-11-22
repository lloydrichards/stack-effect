---
name: stack-effect-testing
description: Design, review, or consolidate tests in Stack Effect. Use to choose what a test should prove, where it belongs, and which cases to keep.
---

# Test design

- Name the behavior and the failure the case would catch. Extend an existing case when the failure belongs to the same scenario. For a regression, when practical, run the same test against the broken and fixed behavior. Check that the broken version fails at the intended assertion.
- Exercise the smallest entry point a caller uses that reproduces the failure. Assert a returned value, typed failure, emitted event, file, or other observable state. Assert constraints when multiple results are valid. Pin exact order, text, or interaction counts only when they are part of the contract.
- Use runtime tests for runtime behavior. Add a compile-time assertion for a deliberate inference, assignability, or rejection guarantee that ordinary type-checking would miss.
- During an audit, record the behavior, the entry point, and any overlap. During cleanup, identify the retained check that would catch each removed case's failure or explain why the behavior no longer needs coverage. Keep unique failure, resource cleanup, and concurrency cases. Use named table rows when only the inputs and expected values differ. Keep cases separate when they need different assertions.

## Choose the test location

| Behavior | Where to check it |
| --- | --- |
| Schema decoding, catalog composition, or scaffold policy | The owning package suite. Start with the existing test beside the contract or service. |
| Flags, prompts, exit status, subprocesses, or project files written by the published CLI | The [CLI workspace](../../../apps/cli/AGENTS.md). Use E2E when the command or platform wiring is part of the failure. |
| Recipe Builder worker or browser behavior | The [docs workspace](../../../apps/docs/AGENTS.md). Use browser tests for behavior that requires Chromium or a real worker. |
| Generated target or module behavior | Generate and check the project through the [catalog workspace](../catalog-workspace/SKILL.md). Keep regression tests in the repository suites outside generated targets and modules. |

## Test generated projects

- Keep the workspace test runner and config available. Add a strict package test script when that package has tests.
- Verify module composition, installation, and types across supported catalog combinations. Add runtime cases when they cover distinct failure modes, such as a different database adapter or deployment layout.
- Import the generated package's declared entry point when the catalog promises one. Use source imports for workspace-only examples. Keep short inputs inline and put substantial runnable scenarios in repository-owned fixtures.
- The [Task Planner scenario](../../../apps/cli/e2e/add.test.ts) runs the scratchpad and checks the public import in Bun before injecting the [planner fixture](../../../apps/cli/e2e/fixtures/task-plan.test.ts.txt). The fixture checks valid ordering constraints and named cycle cases.

## Set up and verify

- Default to `it.effect` from `@effect/vitest` in repository Effect suites. Small, synchronous generated-project fixtures may use `Effect.runSync`. Keep the owner under test real and replace the nearest dependency needed to reproduce the failure. Use the existing memory filesystem for repository state. Use a temporary project with a real filesystem when the behavior depends on the platform.
- Use `TestClock` from `effect/testing` for Effect time. For concurrent work, await the signal that proves readiness or completion, such as a Deferred, a fiber result, or an observed state change.
- Use controlled HTTP fixtures for routine tests. Check deployed registry CORS, cache validators, and genuine 404 responses separately before releasing clients that depend on them.
- For examples, see [CatalogLoader tests](../../../packages/scaffold/src/service/catalog/CatalogLoader.test.ts) for controlled HTTP and time, and [repository state integration tests](../../../packages/scaffold/src/service/plan/RepositoryStateIntegration.test.ts) for Plan and Apply against a memory filesystem.
- Run `bun run test --filter=<workspace>` from the repository root for each affected workspace that defines a test task. Follow the workspace instructions for CLI E2E and browser checks.
