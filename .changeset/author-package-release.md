---
"@stack-effect/author": minor
---

Publish `@stack-effect/author` to define, validate, and build Stack Effect catalogs outside this repository.

```bash
npm install @stack-effect/author effect@4.0.0-rc.117 @effect/platform-node@4.0.0-rc.117
```

```ts
const { json } = await Effect.runPromise(
  buildCatalog(
    { targets: [targets], modules: [modules] },
    { catalogId: "acme", root: new URL("./", import.meta.url) },
  ).pipe(Effect.provide(NodeServices.layer)),
);
```

Define targets and modules with `defineTargets` and `defineModules`, keep file bodies in template files, and build a deterministic v1 catalog document with `buildCatalog`. A catalog that extends the official one declares `requires: ["official"]` and validates against the document from `loadOfficialCatalog`. Finalize scripts are rejected unless you pass `finalizeScripts: "allow"`, and consumers run them only with consent. The package ships ESM with bundled types and needs `effect@4.0.0-rc.117` as an exact peer.
