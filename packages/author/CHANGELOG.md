# @stack-effect/author

## 0.3.1

### Patch Changes

- a194358: Generated projects and catalog authoring now use Effect 4.0.6.

## 0.3.0

### Minor Changes

- f820f29: Target names now support nested directories while keeping npm package names flat.
  
  For example, `package/sdk/client` creates `packages/sdk/client` with the name `@repo/sdk-client`, and `server/sdk/api` creates `apps/sdk/server-api` with the name `server-sdk-api`. Additions use the same target name to find the existing package. Conflicting package names and overlapping package roots are rejected before files are written.
  
  Generated workspaces register package owners explicitly so nested template manifests do not interfere with dependency installation.
- 1665149: Catalog templates can select content based on the modules attached to a target with `module` and `noModule` conditions.
  
  Publishable libraries now use one `package.json` for workspace use and npm publication. Build before importing the library in the workspace, use `npm run dev` to watch changes, and run `npm run pack` or `npm publish` from the library directory.

## 0.2.0

### Minor Changes

- 7f1b883: Generated projects and catalog authoring now use stable Effect 4.0.0.
  
  The author package requires `effect@4.0.0`. Update imports from `effect/unstable/*` to `effect/*`, using `effect/http-api` for HTTP API modules. `Effect.partition` now returns `[successes, failures]`.

## 0.1.0

### Minor Changes

- 638bb6d: Publish `@stack-effect/author` to define, validate, and build Stack Effect catalogs outside this repository.
  
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
