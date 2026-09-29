---
"stack-effect": minor
---

Select catalog sources with a repeatable `--catalog` flag. `init` and `create` save the selection to `stack.effect.json`, and later commands use the saved set. A custom-only selection creates a project without official tool defaults. `--yes` now runs only official Finalize scripts; pass `--trust` to also run scripts from custom catalogs.

For example, `stack-effect create api --catalog official --catalog acme=https://catalog.acme.dev/v1.json --target server/api:acme-auth` composes both catalogs. Projects without `catalogs` keep using the official catalog.
