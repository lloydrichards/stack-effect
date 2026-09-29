---
"@stack-effect/docs": minor
---

Host the catalog registry and add guides for catalog updates, offline use, and publishing your own catalog.

```bash
curl -s https://stack-effect.lloydrichards.dev/registry/v1/author.json | head -c 200
```

The official catalog is served at `/registry/v1/catalog.json`, the author catalog at `/registry/v1/author.json`, and the `stack.effect.json` schema at `/schemas/v1/stack.effect.schema.json`, with CORS and revalidation headers for browsers.
