---
"stack-effect": minor
---

CLI commands now load the official catalog from the Stack Effect registry, so new targets and modules arrive without upgrading the CLI.

`init`, `create`, `add`, `graph`, `plan`, and `schema` fetch the current catalog before any other work; `--help` and `--version` work offline. If the registry is unreachable, times out, or returns a server error, commands fall back to the last validated catalog in the user cache and print a warning to stderr:

```bash
bunx stack-effect@latest add --target package/db:package-db-sqlite
# catalog official (https://stack-effect.lloydrichards.dev/registry/v1/catalog.json): using cached data last validated at 2026-09-29T08:00:00.000Z.
```

With no cached copy, the command stops before writing any files. New projects also include a `$schema` link in `stack.effect.json` for editor completion.
