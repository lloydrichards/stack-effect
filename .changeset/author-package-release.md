---
"@stack-effect/author": minor
---

Publish `@stack-effect/author` for authoring catalogs outside this repository. Define targets and modules in TypeScript, keep file bodies in template files, and build a deterministic v1 catalog with `buildCatalog`. A catalog that extends the official one declares `requires: ["official"]` and validates against the document from `loadOfficialCatalog`. `finalizeScripts: "allow"` publishes Finalize scripts, which consumers run only with consent. The package ships ESM and bundled types, and needs `effect@4.0.0-rc.117` as a peer.
