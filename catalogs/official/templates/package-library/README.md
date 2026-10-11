# {{packageName}}

A small ESM library with TypeScript declarations.

## Add public exports

Add your implementation under `src/` and export it from `src/index.ts`:

```ts
export { greet } from "./greet.js";
```

Keep the `.js` extension in relative imports and exports. TypeScript resolves it to the source `.ts` file and emits paths that work in Node.

The package initially exposes only its root entry point. Add explicit `exports` entries if you need public subpaths.

## Build and pack

Run `npm run build` and `npm pack` from this directory. Packing rebuilds the JavaScript and declarations in `dist/`. Node and npm are required for this publishing workflow, including in a Bun workspace. Install the workspace dependencies before building.

Effect is a peer dependency. Consumers supply the compatible Effect version; the development dependency lets this package compile. If the public API does not use Effect, remove both entries.

## Before publishing

- Replace the placeholder `{{packageName}}` name with your npm package name and update workspace consumers.
- Choose your version and license, and add the appropriate license file.
- Add your package description, repository, and other author metadata.
- Verify the packed tarball in a clean consumer, including runtime imports and TypeScript declarations.
- Keep unpublished `@repo/*` dependencies out of emitted JavaScript and declarations.
- Publish deliberately with npm after reviewing the packed files.

`publishConfig.access` is `public`. This scaffold does not publish automatically.
