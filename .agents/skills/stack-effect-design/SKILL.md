---
name: stack-effect-design
description: Design or review Stack Effect package layout, public and internal modules, `exports` subpaths, Effect service interfaces, dependency boundaries, and catalog module titles. Use when adding or moving a module, package, or subpath, changing what callers import or provide, or naming modules for Recipe Builder and the CLI.
---

# Package and service design

1. Start with the current owner and its callers. Read the closest `AGENTS.md`, the package manifest, and the relevant [OKF contract](../../../.okf/index.md). Check the installed Effect guide as described in the [root instructions](../../../AGENTS.md).
2. Compare what callers need to know about ordering, configuration, failures, and resource ownership. Keep those obligations in the owning service where possible. Before adding a helper or service, ask where the work would go if you removed it. Keep it if it removes repeated caller work or owns a real dependency or lifetime.
3. Use the existing entry point unless a new consumer needs a distinct one. Check the manifest's `exports` map, the code it points to, and the actual imports. Keep implementation files private to their workspace. Follow the closest sibling package for new workspace packages, then check root workspace discovery, build and test tasks, and packaging for affected consumers.

## Lay out a package

Build deep modules with narrow public APIs, as Effect and `@effect-vfs` do.

- **One public module per concept.** Each public module is `src/X.ts`, and the module is its documentation and API design layer. Group a package's public API by concept, as Effect groups `Effect` or `Schema`, not one module per service. `@repo/scaffold/Plan` holds `Planner` and `ContributionResolver`, and `@repo/scaffold/Apply` holds `Applier`, `ApplyWorkspaces`, and `RecipePreviewer`.
- **One subpath per public module.** Expose each public module as its own subpath in `exports`, named after the module, and set `"./internal/*": null`. Do not add a root index to a new package, and do not hand-maintain index or per-platform re-export files. Lint rejects `export *` barrels. It cannot see a file of named re-exports, so reviewers check for those. Two packages keep a root entry, and lint exempts both: `@repo/tui`, and the published `@stack-effect/author`, whose root re-exports its subpaths so imports written before them keep working. Leave those entries alone in unrelated changes.
- **Internal modules.** Keep a small implementation in the public file. When it gets deep, move it to `src/internal/x.ts`, mark every export `/** @internal */`, and let the public file delegate with explicitly typed exports, such as `export const empty: <K, V>() => HashMap<K, V> = internal.empty`.
- **Services across the boundary.** A service keeps its class and shape in `X.ts` and builds its layer from its internal module's constructor. An internal module imports its own public module as types only, to avoid a runtime import cycle. It may import other public modules as values, as Effect's internals do. When one public module holds several services, give each constructor its own name, such as `planner.makePlanner`, and pass in a service from the same public module, as `ContributionResolver.use(planner.makePlanner)` does.
- **Avoid cycles between concepts.** Public modules import each other in one direction. Place a service where its dependencies already point. `RecipePreviewer` needs `RecipeResolver` from `Recipe` and `ApplyWorkspaces` from `Apply`, so it lives in `Apply`. In `Recipe` it would close a cycle: `Recipe` would import `Apply`, while `Apply`, through `ApplyWorkspaces` planning, reaches `Plan`, which imports `RecipeResolver`.
- **Contracts in domain.** Put data contracts and service-free helpers that clients import in `@repo/domain`, so a client such as the Recipe Builder UI does not load a service to read a default or parse a target spec. Name its modules after the lifecycle concepts, `Selection`, `Blueprint`, `Plan`, `Apply`, `Finalize`, `Recipe`, and `Catalog`, plus `StackConfig` for the persisted `stack.effect.json`. Keep each schema, error, and helper, such as an `Order`, in the concept it serves, not in a utility or grab-bag module. Define any data a package returns to another package as a Schema there, even when nothing decodes it yet, and build values with its `make` so the contract is checked where it is produced.
- **Presentation stays in apps.** Shared packages return data. Put presentation, such as terminal layout, colours, prompts, and UI, in the app that presents it. Delete presentation code that has no caller instead of moving it.
- **Tests.** Tests live in `test/`, outside `src/`, and import only public modules. Use the [test design skill](../stack-effect-testing/SKILL.md) for file placement and naming.
- **Generated code.** The same rules apply. Modules add a package's public entry points as `package.json` `exports` subpaths through `pkg-json-entry` contributions with `field: "exports"`, not as `export *` lines in a composed `src/index.ts`.

## Keep exports honest

Export only what another module uses in production code. A test is not a caller. `fallow dead-code --production --include-entry-exports` enforces this in `bun lint`.

When Fallow cannot see a class member that production code calls through an inferred or nested type, put `// fallow-ignore-next-line unused-class-member -- called by <caller>` on the line above the member. Do not add names to `usedClassMembers`, because a name there exempts every class that has a member by that name. Do not silence other findings, such as duplicate exports or circular dependencies, with ignore entries or comments. Fix the export, the names, or the import direction instead.

## Lint that enforces layout

| Rule | Where | What it rejects |
| --- | --- | --- |
| `layout/no-src-tests` | [`tools/oxlint/layout.mjs`](../../../tools/oxlint/layout.mjs) | A `.test` or `.fixture` file under `src/` |
| `oxc/no-barrel-file` | [`.oxlintrc.json`](../../../.oxlintrc.json) | `export *` re-exports, outside the `author` and `tui` entries |
| `no-restricted-imports` | `.oxlintrc.json`, test override | A test importing `**/internal/**` |
| Fallow dead code | [`.fallowrc.json`](../../../.fallowrc.json) | Unused exports, duplicate exports, and circular dependencies |

## Check the consumers

| Change | What to inspect |
| --- | --- |
| Shared schemas or persisted data | [Domain instructions](../../../packages/domain/AGENTS.md), schema readers and writers, and existing stored documents. |
| Shared scaffold behavior or exports | The [scaffold manifest](../../../packages/scaffold/package.json), CLI consumers, and the Recipe Builder worker. Keep the modules Recipe Builder imports free of server-only dependencies. |
| Authoring API | The [authoring instructions](../../../packages/authoring/AGENTS.md) and the published `@stack-effect/author` wrapper. Run `bun run --cwd packages/author verify:package` for public API or packaging changes. |
| Published CLI library entry point | The [CLI manifest](../../../apps/cli/package.json). Run `bun run --cwd apps/cli verify:library` for changes to the library exports or their packaging. |

Use the [test design skill](../stack-effect-testing/SKILL.md) to check caller behavior and type guarantees. Record durable changes to contracts or ownership in the relevant OKF concept.

## Name catalog modules

Choose module titles with the [authoring guide](../../../.okf/guides/add-new-module.md#choose-a-display-title). Review the titles in Recipe Builder and CLI dependency trees.
