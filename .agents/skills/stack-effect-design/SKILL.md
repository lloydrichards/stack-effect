---
name: stack-effect-design
description: Design or review Stack Effect package exports, Effect service interfaces, and dependency boundaries. Use when changing what callers import, provide, or need to know.
---

# Package and service design

1. Start with the current owner and its callers. Read the closest `AGENTS.md`, the package manifest, and the relevant [OKF contract](../../../.okf/index.md). Check the installed Effect guide as described in the [root instructions](../../../AGENTS.md).
2. Compare what callers need to know about ordering, configuration, failures, and resource ownership. Keep those obligations in the owning service where possible. Before adding a helper or service, ask where the work would go if you removed it. Keep it if it removes repeated caller work or owns a real dependency or lifetime.
3. Use the existing entry point unless a new consumer needs a distinct one. Check the manifest's `exports` map, the code it points to, and the actual imports. Keep implementation files private to their workspace. Follow the closest sibling package for new workspace packages, then check root workspace discovery, build and test tasks, and packaging for affected consumers.

## Check the consumers

| Change | What to inspect |
| --- | --- |
| Shared schemas or persisted data | [Domain instructions](../../../packages/domain/AGENTS.md), schema readers and writers, and existing stored documents. |
| Shared scaffold behavior or exports | The [scaffold manifest](../../../packages/scaffold/package.json), CLI consumers, and the Recipe Builder worker. Keep the browser entry point free of server-only dependencies. |
| Authoring API | The [authoring instructions](../../../packages/authoring/AGENTS.md) and the published `@stack-effect/author` wrapper. Run `bun run --cwd packages/author verify:package` for public API or packaging changes. |
| Published CLI library entry point | The [CLI manifest](../../../apps/cli/package.json). Run `bun run --cwd apps/cli verify:library` for changes to the library exports or their packaging. |

Use the [test design skill](../stack-effect-testing/SKILL.md) to check caller behavior and type guarantees. Record durable changes to contracts or ownership in the relevant OKF concept.
