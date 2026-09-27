---
"stack-effect": minor
---

CLI commands now load the official catalog before generating or updating a project. During an outage, they can use a previously validated catalog from the user cache and print a warning to stderr.

For example, `stack-effect add --target package/db:package-db-sqlite` checks current catalog definitions before planning changes. New projects include the hosted JSON Schema link in `stack.effect.json`.
