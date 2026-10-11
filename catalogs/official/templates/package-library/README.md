# {{packageName}}

A small ESM library with TypeScript declarations.

## Add public exports

Add your implementation under `src/` and export it from `src/index.ts`:

```ts
export { greet } from "./greet.js";
```

Keep `.js` extensions in relative imports and exports. TypeScript resolves them to source `.ts` files and emits paths that work in Node.

The workspace package stays private and exposes its source entry point. `package.publish.json` describes the published package, which exposes only its compiled root entry point. Add explicit exports there when you need public subpaths.

## Build and pack

Install the workspace dependencies, then run `npm run pack` from this directory. The command rebuilds JavaScript and declarations, copies the publication manifest and README into `dist/`, and packs that directory. Each build removes stale output. Node and npm are required, including in a Bun workspace.

Use `npm run build` to inspect the output without packing. The published package declares Effect as a peer dependency; workspace development uses the existing Effect dependency. If your public API does not use Effect, remove its peer entry from `package.publish.json`.

## Before publishing

- Set your npm name, version, license, description, and repository in `package.publish.json`.
- Add a `LICENSE` file here; the build copies it into `dist/` when present.
- Verify the tarball in a clean consumer, including runtime imports and TypeScript declarations.
- Keep unpublished `@repo/*` imports out of emitted JavaScript and declarations.
- Inspect the packed files, then run `npm publish ./dist` deliberately.

The publication manifest declares public npm access. Publish `dist/`; the workspace root package remains private. This scaffold does not publish automatically.
