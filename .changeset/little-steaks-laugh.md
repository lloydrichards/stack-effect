---
"stack-effect": minor
---

Add CLI target module and file contributions

- Add `hello-command` module to the CLI target with a hello-world subcommand
- Wire module into the CLI entrypoint via `ts-call-arg` composition contribution
- CLI target now supports incremental module additions:
  ```sh
  bunx stack-effect@latest add --target cli --modules hello-command
  ```
