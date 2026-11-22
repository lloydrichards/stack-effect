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
- Production CLI commands and Recipe Builder sessions load registry JSON through `CatalogLoader`. Reuse the resolved `CatalogService` across the operation. Keep bundled definitions in repository authoring and fixtures.
- When changing shared behavior, check the affected entry points. Consider interactive and non-interactive CLI paths, Recipe Builder, and existing projects as applicable. For a catalog source change, check both `--catalog` and persisted `stack.effect.json` sources against the [source selection contract](.okf/domain/catalog-sources.md).

Read the [OKF index](.okf/index.md) to find the relevant contract or decision. Use the [canonical vocabulary](.okf/domain/ubiquitous-language.md) and [domain definitions](.okf/domain/index.md). When a durable rule or decision changes, use the [OKF skill](.agents/skills/okf/SKILL.md) to update its concept. Run `bun run okf:check` after bundle edits.

## Engineering taste

- Extend the existing owner first. Add a helper when it names a real concept or removes duplicated behavior. Add a service when a capability needs its own dependency or lifecycle boundary. Keep each PR focused on one outcome.
- Keep CLI commands and Recipe Builder handlers focused on decoding inputs, calling shared services, and presenting results. Put filesystem and HTTP quirks in adapters. For example, both entry points should get the same conflict from Plan, then each can present it in its own way.
- Infer local types. Declare types where they define a contract. Write comments for constraints the code cannot show, such as why generated template bytes must stay verbatim. Put the change history in the PR.
- Declare each feature's environment configuration in a named, module-level `Config.all({ ... })`, even when it has one field. Read it in the feature's layer or entry point. Keep defaults and secret redaction in that declaration so readers can scan the full set of settings.
- Put domain schemas, data types, and errors in the scaffold's `packages/domain`. Keep runtime services, transport and storage adapters, and framework-specific state and messages with their implementations.
- Use blank lines between distinct steps in a function, such as reading configuration, validating input, running an operation, and handling its result. Follow the surrounding code's structure so the steps are easy to scan.
- Reuse existing theme tokens and UI atoms in generated clients. Follow nearby modules for form controls, cards, validation feedback, focus states, and accessible markup.
- Keep `.test.ts` and `.test.tsx` files out of generated targets and modules. Keep scaffold and integration verification in the repository's test workspaces.

## Work with Effect in this repo

- Use named `Effect.fn("Service.operation")` for new service operations. Keep existing span names stable. Use `Effect.gen` for inline programs and layer construction, and `yield*` to compose effects. Use `Effect.fnUntraced` when a helper already runs inside a traced operation or would emit a span on every item in a loop.
- Resolve service dependencies when constructing the layer. Wire platform layers and run the Effect at the entry point. Keep pure calculations as plain typed functions and keep expected failures in the Effect error channel. Recover where the caller or adapter has enough context to decide what to do.
- Decode external inputs with Effect Schema and derive types from the schema. Fix type gaps in the model or use typed fixtures and stubs. Avoid `any` and `as unknown as` casts.
- Check the nearest service and the installed Effect types before choosing an unfamiliar API. Use `.reference/effect/LLMS.md` when the local checkout matches the installed version. Otherwise, check the upstream [Effect 4.1.4 guide](https://github.com/Effect-TS/effect/blob/effect@4.1.4/LLMS.md) for the version currently pinned here. Use the Effect skill for the branch relevant to the task. For dependency updates, verify against upstream source for the target version.

## Verify changes

- Use `bun install` to install dependencies. Run `bun format`, `bun lint`, and `bun run type-check` before completion. Use `bun format:check` to identify formatting drift without writing, and keep unrelated edits out of the change.
- For behavior changes, run `bun run test --filter=<workspace>` for each impacted workspace that defines a test task. Use the package name from its manifest. Always use `bun run test` instead of `bun test` so Turbo task wiring applies.
- Extend an existing test when it fits. Test a regression at the lowest layer that can reproduce it. Use a browser test for behavior that needs a real browser or worker. In Effect tests, use `TestClock` for time and await the relevant signal or result for concurrent work.
- Use controlled HTTP fixtures for routine tests. Check deployed registry CORS, cache validators, and genuine 404 responses separately before releasing clients that depend on them.
- For dead-code or complexity work, use the repo's [Fallow config](.fallowrc.json). Start with `bunx fallow dead-code -f json` or `bunx fallow health -f json`.

## Prepare a pull request

- Open a PR when requested. Use a Conventional Commit title that names the outcome, such as `fix(cli): preserve catalog sources when adding a target`.
- Follow the [PR template](.github/pull_request_template.md). Lead with the problem and who it affects. Describe the resulting behavior and call out any compatibility or migration impact. Give reviewers the exact checks you ran and their results, including anything you could not verify.
- Match the evidence to the change. Use a CLI transcript or generated diff for scaffolding, before and after captures for visual changes, and a short clip for motion or timing. Attach review evidence to the PR and keep it out of source commits.
