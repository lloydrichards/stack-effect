# Stack Effect

Stack Effect scaffolds and extends Effect projects. The CLI in [apps/cli](apps/cli) exposes `init`, `add`, and `graph`. The docs site in [apps/docs](apps/docs) hosts Recipe Builder and serves catalog registry assets.

## Find the owner before editing

| Change | Start here |
| --- | --- |
| CLI arguments, prompts, output, or command wiring | [CLI instructions](apps/cli/AGENTS.md) |
| Recipe Builder, public docs, or registry assets | [Docs workspace instructions](apps/docs/AGENTS.md) |
| Shared terminal prompts and key bindings | [TUI package](packages/tui/src) |
| Shared schemas and lifecycle contracts | [Domain instructions](packages/domain/AGENTS.md) |
| Blueprint resolution, Plan, Apply, or Finalize behavior | [Scaffold services](packages/scaffold/src) |
| Catalog lookup and composition | [Catalog package](packages/catalog/src) |
| Catalog authoring API or validation | [Authoring instructions](packages/authoring/AGENTS.md) |
| Target and module definitions or generated files | [Official catalog](catalogs/official), [author catalog](catalogs/author), and [catalog authoring guides](.okf/guides/index.md) |

For official catalog modules and templates, follow the [catalog-workspace skill](.agents/skills/catalog-workspace/SKILL.md). Generate the authoring workspace, edit and validate the generated files, then port the minimal change back to the catalog.

## Preserve the scaffolding contracts

- Keep Selection as user intent, Blueprint as resolved dependency closure, Plan as repository-aware outcomes, and Apply as execution intent. Identical inputs should produce identical Blueprint and Plan outputs.
- Keep Plan free of apply policy. Require exactly one ApplyDecision per conflicted planned path, with no decisions for other paths.
- Modules contribute only to their owning target. Model cross-target effects as target or module dependencies.
- Keep shared contracts in `@repo/domain` and runtime behavior in the scaffold or catalog service that owns it. Preserve explicit failures and conflicts so callers can handle them.
- Production CLI commands and Recipe Builder sessions load registry JSON through `CatalogLoader`. Reuse the resolved `CatalogReader` across the operation. Keep bundled definitions in repository authoring and fixtures.
- When changing shared behavior, check the affected entry points. Consider interactive and non-interactive CLI paths, Recipe Builder, and existing projects as applicable. For a catalog source change, check both `--catalog` and persisted `stack.effect.json` sources against the [source selection contract](.okf/domain/catalog-sources.md).

Read the [OKF index](.okf/index.md) to find the relevant contract or decision. Use the [canonical vocabulary](.okf/domain/ubiquitous-language.md) and [domain definitions](.okf/domain/index.md). When a durable rule or decision changes, use the [OKF skill](.agents/skills/okf/SKILL.md) to update its concept. Run `bun run okf:check` after bundle edits.

## Choose the workflow

| Task | Guidance |
| --- | --- |
| Add, review, or consolidate tests | [Test design](.agents/skills/stack-effect-testing/SKILL.md) |
| Add or move a module, package, or subpath, or change a service interface, package export, or dependency boundary | [Package design](.agents/skills/stack-effect-design/SKILL.md) |
| Change generated code or the catalog source that emits it | [Catalog workspace](.agents/skills/catalog-workspace/SKILL.md) |

When writing or reviewing TypeScript, read the [coding taste guide](.agents/TASTE.md). It covers how code reads: Effect idioms, naming, services and Layers, schemas, errors, and matching, with links to the generated Todo and SQLite examples. Package layout and test placement live in the skills above.

## Engineering taste

- Extend the existing owner first. Keep each PR focused on one outcome.
- Keep CLI commands and Recipe Builder handlers focused on decoding inputs, calling shared services, and presenting results. Put filesystem and HTTP quirks in adapters. For example, both entry points should get the same conflict from Plan, then each can present it in its own way.
- Write comments for constraints the code cannot show, such as why generated template bytes must stay verbatim. Put the change history in the PR.
- Put service-free contracts that clients import, such as schemas, data types, and errors, in the scaffold's `packages/domain`, and keep anything that stays inside one module with that module. Keep runtime services, transport and storage adapters, and framework-specific state and messages with their implementations. The [package design skill](.agents/skills/stack-effect-design/SKILL.md#lay-out-a-package) has the full rule.
- Reuse existing theme tokens and UI atoms in generated clients. Follow nearby modules for form controls, cards, validation feedback, focus states, and accessible markup.
- Keep `.test.ts` and `.test.tsx` files out of generated targets and modules. Keep scaffold and integration verification in the repository's test workspaces.

## Work with Effect in this repo

- Follow the [coding taste guide](.agents/TASTE.md) for spans, services, Layers, and error handling.
- Decode external inputs with Effect Schema and derive types from the schema. Fix type gaps in the model or use typed fixtures and stubs. Avoid `any` and `as unknown as` casts.
- Check nearby code before choosing an unfamiliar Effect API. Start with `node_modules/effect/AGENTS.md` and follow the links for the API you need. Read the installed source or declarations when the guide leaves a question open. Use a local checkout or upstream source only at the matching version. For a dependency update, check the target version.

## Verify changes

- Use `bun install` to install dependencies. Run `bun format`, `bun lint`, and `bun run type-check` before completion. Use `bun format:check` to identify formatting drift without writing, and keep unrelated edits out of the change.
- For behavior changes, run `bun run test --filter=<workspace>` for each impacted workspace that defines a test task. Use the package name from its manifest. Always use `bun run test` instead of `bun test` so Turbo task wiring applies.
- For dead-code or complexity work, use the repo's [Fallow config](.fallowrc.json). Start with `bunx fallow dead-code -f json` or `bunx fallow health -f json`.

## Prepare a pull request

- Open a PR when requested. Use a Conventional Commit title that names the outcome, such as `fix(cli): preserve catalog sources when adding a target`.
- Follow the [PR template](.github/pull_request_template.md). Lead with the problem and who it affects. Describe the resulting behavior and call out any compatibility or migration impact. Give reviewers the exact checks you ran and their results, including anything you could not verify.
- Match the evidence to the change. Use a CLI transcript or generated diff for scaffolding, before and after captures for visual changes, and a short clip for motion or timing. Attach review evidence to the PR and keep it out of source commits.
