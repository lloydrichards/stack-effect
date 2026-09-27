# CLI AGENTS.md

> See root `/AGENTS.md` for monorepo conventions.

## Commands

| Command                                | Purpose                |
| -------------------------------------- | ---------------------- |
| `bun dev --filter=stack-effect`        | Start the CLI app      |
| `bun run build --filter=stack-effect`  | Build the CLI app      |
| `bun type-check --filter=stack-effect` | Type-check the CLI app |

## Conventions

- Keep the initial CLI scaffold single-file until complexity appears.
- Use `effect/unstable/cli` with `Command.make(...)` and `Command.run(...)`.
- Provide the configured Node or Bun runtime services through `PlatformLayer`.
- Production commands use `CatalogProvider.official`; local authoring uses `CatalogProvider.authoring`. Keep registry warnings on stderr so JSON stdout remains parseable.
- E2E tests use `e2e/entrypoint.ts` for a controlled catalog response. Do not make routine tests depend on the deployed registry.

## Domain Terminology References

Use canonical domain language from:

- `.okf/domain/ubiquitous-language.md` for conversation-ready phrasing
- `.okf/domain/index.md` for precise definitions and invariants
