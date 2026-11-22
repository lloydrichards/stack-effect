---
"@stack-effect/docs": minor
---

Breaking: the browser worker, managed chat runtime, and Web Fetch toolkit now come from Labs. To keep using them in an existing project, retain `official` and add `{ "name": "labs", "url": "https://stack-effect.lloydrichards.dev/registry/v1/labs.json" }` to `stack.effect.json` under `catalogs`.

New Recipe Builder sessions start with both sources. Labs also adds a Bun PersistedQueue example with separate enqueue and consume commands backed by SQLite.
