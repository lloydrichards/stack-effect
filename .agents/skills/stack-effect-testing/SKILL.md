---
name: stack-effect-testing
description: Design, review, or consolidate tests in Stack Effect. Use to choose what a test should prove, where it belongs, and which cases to keep.
---

# Test design

- Name the behavior and the failure the case would catch. Extend an existing case when the failure belongs to the same scenario. For a regression, when practical, run the same test against the broken and fixed behavior. Check that the broken version fails at the intended assertion.
- Exercise the smallest entry point a caller uses that reproduces the failure. Assert a returned value, typed failure, emitted event, file, or other observable state. Assert constraints when multiple results are valid. Pin exact order, text, or interaction counts only when they are part of the contract.
- Use runtime tests for runtime behavior. Add a compile-time assertion for a deliberate inference, assignability, or rejection guarantee that ordinary type-checking would miss.
- During an audit, record the behavior, the entry point, and any overlap. During cleanup, identify the retained check that would catch each removed case's failure or explain why the behavior no longer needs coverage. Keep unique failure, resource cleanup, and concurrency cases. Use named table rows when only the inputs and expected values differ. Keep cases separate when they need different assertions.

## Write the test

- Keep tests out of `src/`, in the workspace's `test/` directory, as Effect and `@effect-vfs` do. Lint rejects any `.test`, `.spec`, or `.fixture` file under `src/`. Name each file after the public module it exercises, `test/X.test.ts`. In an app, mirror the `src/` folders for module and command tests, so `src/commands/add.ts` is tested in `test/commands/add.test.ts`. When a test drives several commands to check one contract, name it after the contract and keep it beside the commands it drives, such as `test/commands/catalogSources.test.ts`. Test a shared package in that package's own suite, not from an app.
- Keep one test file per module, command, or contract, however long it grows, and separate its sections with nested `describe` blocks. Split off `test/X.<scenario>.test.ts` only when the scenario cannot share the file's setup, such as a different test runner, environment, or global setup. Size, theme, and a separate layer are not reasons to split. Keep fixtures in `test/fixtures/`. Do not test third-party libraries. Type-level tests will go in `typetest/X.tst.ts`, but that runner is not set up yet.
- Test through public modules only. Lint rejects imports from `internal/` in test files.
- Run the real owner over the memory filesystem and assert on results and written files. Do not stub the owner's collaborators or assert on recorded calls.
- Build test inputs through the public pipeline, starting from the smallest input a user gives, such as a selection against a test catalog. Hand-build a phase value only to test that it is rejected. Keep shared test catalogs and inputs in one fixture module per package, in `test/fixtures/`. Do not copy a production module's internal format into a test.
- Inject faults by wrapping a platform service under the real owner, using the package's shared fault helper. Trigger on the method and an observable path or call count, not on names the implementation invents. Assert that the fault fired, then assert the typed failure and the observable aftermath.
- Import `assert`, `describe`, and `it` from `@effect/vitest`, and assert with `assert`.
- Check an expected failure with `Effect.flip`, then assert its `_tag` and identifying values such as a path or id. Pin full message text only when the text is the contract. Use `Effect.exit` only to assert a defect or interruption. Do not use `Cause.squash` to assert a typed failure.

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
- For examples, see [Catalog tests](../../../packages/scaffold/test/Catalog.test.ts) for controlled HTTP and time, and [Apply repository state tests](../../../packages/scaffold/test/Apply.test.ts) for Plan and Apply against a memory filesystem.
- Run `bun run test --filter=<workspace>` from the repository root for each affected workspace that defines a test task. Follow the workspace instructions for CLI E2E and browser checks.
