# {{packageName}}

A small ESM library with TypeScript declarations.

## Run the example

Run `npm run example` from this directory to build the library and print `Hello, Effect!`.

`src/index.ts` exports `greet(name)`, which returns an Effect containing a greeting. `scripts/example.mjs` imports the compiled public API by package name, runs the Effect, and prints its result. Change the greeting or use this script to try new exports.

## Add public exports

Replace the starter greeting or add implementation files under `src/` and export them from `src/index.ts`:

```ts
export { greet } from "./greet.js";
```

Keep `.js` extensions in relative imports and exports. TypeScript resolves them to source `.ts` files and emits paths that work in Node.

`package.json` describes both the workspace package and the published package. Its root export points to `dist/index.js`; TypeScript resolves the adjacent `dist/index.d.ts`. Add explicit entries to `exports` when you need public subpaths.

## Build and develop

Install workspace dependencies, then run `npm run build` before importing the library from another workspace package. Run `npm run dev` to recompile changes during development. Workspace consumers use the same compiled entry point as npm consumers.

## Pack and publish

Run `npm run pack` from this directory to clean previous output, compile JavaScript and declarations, and pack the package root. The `files` list includes only compiled JavaScript and declarations under `dist/`; npm also includes the root manifest, README, and LICENSE when present. Node and npm are required, including in a Bun workspace.

Effect is a peer dependency for consumers and a development dependency for local builds. Remove both entries if your library does not use Effect.

Before publishing:

- Set your npm name, version, license, description, and repository in `package.json`. Update workspace imports and dependency entries if you rename the package.
- Add a `LICENSE` file beside `package.json`.
- Verify the tarball in a clean consumer, including runtime imports and TypeScript declarations.
- Keep unpublished `@repo/*` imports out of emitted JavaScript and declarations.
- Inspect the packed files, then run `npm publish` from this directory.

The library manifest sets `private` to `false` and declares public npm access. Stack Effect does not publish automatically.
