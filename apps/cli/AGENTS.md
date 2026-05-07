# CLI AGENTS.md

> See root `/AGENTS.md` for monorepo conventions.

## Commands

| Command                   | Purpose                 |
| ------------------------- | ----------------------- |
| `bun dev --filter=cli`    | Start the CLI app       |
| `bun run build --filter=cli` | Build the CLI app    |
| `bun type-check --filter=cli` | Type-check the CLI app |

## Conventions

- Keep the initial CLI scaffold single-file until complexity appears.
- Use `effect/unstable/cli` with `Command.make(...)` and `Command.run(...)`.
- Provide Bun runtime services with `BunServices.layer`.

## Domain Terminology References

Use canonical domain language from:

- `.docs/ubiquitous-language.md` for conversation-ready phrasing
- `.docs/domain-lexicon.md` for precise definitions and invariants
- `CONTEXT.md` for current domain decisions and constraints
