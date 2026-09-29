---
"@stack-effect/docs": minor
---

Recipe Builder now loads the current catalog from the registry and can compose named catalogs.

For example, adding the author catalog renders:

```bash
bunx stack-effect@latest create my-catalog \
  --catalog official \
  --catalog author=https://stack-effect.lloydrichards.dev/registry/v1/author.json \
  --target catalog/registry:catalog-starter
```

Add a catalog by name and URL, or remove the official catalog when every selected catalog stands on its own; tool, database, and Git options hide until it is added back. A catalog that requires the official one keeps it selected. Shared links carry the selection in repeatable `catalog` parameters and ask before loading a custom catalog. During a registry outage, the Builder uses its cached catalog and shows a notice.
