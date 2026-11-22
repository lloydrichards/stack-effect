---
name: stack-effect-testing
description: Design, review, or consolidate tests in Stack Effect. Use to choose what a test should prove, where it belongs, and which cases to keep.
---

# Test design

- Name the behavior and the failure the case would catch. Extend an existing case when the failure belongs to the same scenario. For a regression, reproduce the expected failure before the fix when practical.
- Exercise the smallest entry point a caller uses that reproduces the failure. Assert a returned value, typed failure, emitted event, file, or other observable state. Use interaction counts or exact output only when they are part of the contract, such as deduplicated requests or parseable CLI JSON.
- Use runtime tests for runtime behavior. Add a compile-time assertion for a deliberate inference, assignability, or rejection guarantee that ordinary type-checking would miss.
- During an audit, record the behavior, the entry point, and any overlap. During cleanup, identify the retained check that would catch each removed case's failure or explain why the behavior no longer needs coverage. Keep unique failure, resource cleanup, and concurrency cases. Share a table across implementations only when they promise the same behavior.

## Choose the test location

| Behavior | Where to check it |
| --- | --- |
| Schema decoding, catalog composition, or scaffold policy | The owning package suite. Start with the existing test beside the contract or service. |
| Flags, prompts, exit status, subprocesses, or project files written by the published CLI | The [CLI workspace](../../../apps/cli/AGENTS.md). Use E2E when the command or platform wiring is part of the failure. |
| Recipe Builder worker or browser behavior | The [docs workspace](../../../apps/docs/AGENTS.md). Use browser tests for behavior that requires Chromium or a real worker. |
| Generated target or module behavior | Generate and check the project through the [catalog workspace](../catalog-workspace/SKILL.md). Keep regression tests in the repository suites outside generated targets and modules. |

## Set up and verify

- Use `it.effect` from `@effect/vitest` in Effect suites. Keep the service under test real, and provide controlled dependencies as Layers. Use the existing memory filesystem for repository state. Use a temporary project with a real filesystem when the behavior depends on the platform.
- Use `TestClock` from `effect/testing` for Effect time. For concurrent work, await the signal that proves readiness or completion, such as a Deferred, a fiber result, or an observed state change.
- Use controlled HTTP fixtures for routine tests. Check deployed registry CORS, cache validators, and genuine 404 responses separately before releasing clients that depend on them.
- For examples, see [CatalogLoader tests](../../../packages/scaffold/src/service/catalog/CatalogLoader.test.ts) for controlled HTTP and time, and [repository state integration tests](../../../packages/scaffold/src/service/plan/RepositoryStateIntegration.test.ts) for Plan and Apply against a memory filesystem.
- Run `bun run test --filter=<workspace>` from the repository root for each affected workspace that defines a test task. Follow the workspace instructions for CLI E2E and browser checks.
