---
name: stack-effect-testing
description: Design, review, or consolidate Stack Effect package, catalog integration, CLI, and docs tests. Use to decide what a test should prove, which workspace owns it, and how to preserve coverage when moving or removing it.
---

# Stack Effect test design

Write down the caller, the public promise, and the plausible regression the test would catch. Use the smallest public entry point that exposes that regression. Choose the owner before choosing fixtures or a runner.

## Choose the owner

| What would break | Where to test it |
| --- | --- |
| A package's exported operation, schema, or service contract | The owning workspace's `test/`. See [package tests](references/package-tests.md). |
| Files or behavior promised by a specific catalog recipe | A catalog integration suite. See [catalog integration tests](references/catalog-integration.md). |
| CLI arguments, prompts, exit status, or command wiring | `apps/cli/test/`, or `apps/cli/e2e/` when the executable or host is part of the failure. See [CLI tests](references/cli-tests.md). |
| Recipe Builder UI, worker behavior, or published docs | `apps/docs/test/`. See [docs and browser tests](references/docs-tests.md). |

Read the references that match the task. For example, test generic protection of edited user files through Scaffold's Plan and Apply with a small fixture. Test official README generation and preservation with the official catalog. Test the CLI's conflict prompt through the CLI. Each case protects a distinct outcome.

## Review or move coverage

1. Map each case to its public entry point, observable outcome, and likely failure. Keep distinct error, compatibility, resource cleanup, and concurrency cases. Use named table rows when cases share the same assertion.
2. Before removing overlap, identify the retained case that would fail for the same defect. A passing suite or shared setup does not establish redundancy. When practical, run a regression check against both broken and fixed behavior and confirm it fails at the intended assertion.
3. When moving tests, carry over the inputs, observable assertions, and meaningful variants. Verify that the destination runner discovers the cases and both local and CI commands still exercise them. Run the source and destination suites.
4. Run `bun run test --filter=<workspace>` from the repository root for each affected workspace with a test task. Use the workspace instructions for additional E2E, browser, and generated-project checks.

The reference-based structure is adapted from [effect-virtual-fs package test design](https://github.com/lloydrichards/effect-virtual-fs/tree/main/.agents/skills/package-test-design).
