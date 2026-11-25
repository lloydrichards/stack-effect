# {{packageName}}

An ESM library whose starter `greet(name)` function returns a greeting. Builds include JavaScript and TypeScript declarations.

## Try it

Complete the [workspace setup]({{projectRoot}}/README.md#get-started). Run from this directory:

```sh
npm run example
```

The example builds the library and prints `Hello, Effect!` using its compiled public API:

```ts
import { greet } from "{{packageName}}";

console.log(greet("Effect"));
```

Consumers need the compatible `effect` peer dependency declared in `package.json`.

## Develop

| Command | Purpose |
| --- | --- |
| `npm run build` | Clean and compile JavaScript and declarations into `dist/` |
| `npm run dev` | Recompile on source changes |
| `npm run type-check` | Check TypeScript without emitting files |
| `npm run pack` | Build and create an npm tarball |

Put each public API in a named file such as `src/X.ts`. Keep its schemas, types, typed errors, and usage examples with the API. If the implementation grows, put private code in `src/internal/x.ts`. Add an export such as `"./X": "./dist/X.js"` to `package.json` so consumers can import the compiled module by subpath. Use `.js` extensions in relative imports between compiled source files so Node can resolve them.

For local experiments, keep a `scratchpad.ts` at the package root. If a module adds a `scratch` script, run `{{runCommand}} scratch` from this directory.

Workspace consumers use the compiled entry point too. Build before importing the package; use the watch command during development.

## Prepare a release

Node and npm are required for the example and packaging scripts, including in this Bun workspace.

1. Replace `{{packageName}}` with your npm package name. Set its version, description, repository, and license in `package.json`; update imports and workspace references when you rename it.
2. Add a `LICENSE` file beside `package.json`.
3. Run `npm run pack` and inspect the tarball. The manifest includes compiled JavaScript and declarations under `dist/`; npm also includes package metadata and root README and license files when present.
4. Install the tarball into a clean consumer and verify runtime imports and TypeScript declarations. Keep unpublished workspace imports out of emitted files.
5. Run `npm publish` from this directory when ready to release publicly.

The starter manifest permits public publishing. Stack Effect does not publish the package automatically.
