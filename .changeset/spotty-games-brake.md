---
"stack-effect": minor
"@stack-effect/author": minor
---

Generated projects and catalog authoring now use stable Effect 4.0.0.

The author package requires `effect@4.0.0`. Update imports from `effect/unstable/*` to `effect/*`, using `effect/http-api` for HTTP API modules. `Effect.partition` now returns `[successes, failures]`.
