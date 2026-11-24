# Docs and Recipe Builder

- Edit public docs in `app/content/`. The CLI generates `app/content/reference/cli/`. Change the CLI command metadata and run `bun run docs:generate` from the repo root to update that reference.
- Use `bun dev --filter=@stack-effect/docs` from the repo root. The dev script generates the CLI reference and catalog registry assets before starting React Router.
- Recipe Builder UI lives in `app/components/recipe-builder/`. The worker in `app/workers/recipe-builder/` imports `@repo/scaffold` subpaths such as `@repo/scaffold/Apply` for `RecipePreviewer`, and is the composition root that provides browser platform layers (in-memory `FileSystem`, `BrowserCrypto`, `Path`). Put shared scaffold behavior in the shared service and keep the worker compatible with the browser.
- For changes to catalog source selection or loading, check both the Recipe Builder worker and the CLI. Browser tests use `test/fixtures/registry-fixture-server.ts`. Keep browser test files serial while they share the fixture's outage and revision state.
- Run `bun run test --filter=@stack-effect/docs` from the repo root. The suite includes Chromium tests. If Chromium is missing, run `bun run --cwd apps/docs playwright install chromium`. For a focused browser run, use `bun run --cwd apps/docs test:browser`.
