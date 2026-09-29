---
"stack-effect": minor
---

Compose catalogs with a repeatable `--catalog` flag. `init` and `create` save the selection to `stack.effect.json`, and later commands reuse it.

For example, create a catalog project from the hosted author catalog:

```bash
bunx stack-effect@latest create my-catalog --yes \
  --catalog official \
  --catalog author=https://stack-effect.lloydrichards.dev/registry/v1/author.json \
  --target catalog/registry:catalog-starter
```

`add`, `graph`, `plan`, and `schema` read the saved `catalogs` list and reject a `--catalog` set that differs from it. Projects without `catalogs` keep using the official catalog. A selection without `official` gets no official tool defaults or Git module. `--yes` runs only official Finalize scripts; pass `--trust` to also run scripts from custom catalogs. `graph` labels each definition with its source when custom catalogs are selected, and `plan` output lists the loaded sources.
