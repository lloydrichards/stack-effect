# Publishable library scaffold

Initial research and proposal, 2026-10-11. The original design discussion below records the catalog before implementation.

## Implementation result

The `package-library` module supports Bun and Node packages with custom names, one compiled root export, and no child modules. It uses the existing catalog contribution types; no interpreter extension or CLI release is required to scaffold it.

The workspace package remains private and exports its source. A separate `package.publish.json` describes the published package. `npm run pack` rebuilds JavaScript and declarations into `dist/`, copies the publication manifest and documentation there, and packs that directory. Publication uses `npm publish ./dist`.

This supersedes the root-manifest composition proposal below. The original proposal needed a new `pkg-json-field` operation because the existing engine cannot set complete publishing fields on an existing package manifest. Keeping publication metadata in its own ordinary file avoids that engine change and its release changeset.

The clean-consumer verifier covers Bun and npm workspaces, Node execution, NodeNext and bundler declarations, private subpaths, and stale-output cleanup. See the [usage guide](../../apps/docs/app/content/publish-library.mdx) and [verifier](../../apps/cli/scripts/verify-library.ts).

## Original recommendation (superseded)

Add one public `package-library` module to the existing `package` target kind. It creates a small ESM library under `packages/<name>`, with one root export and no child modules. Use TypeScript to emit JavaScript and declarations. Add build tooling, subpath exports, and release automation only when a library needs them.

Proposed selection:

```sh
stack-effect add --target package/library:package-library
```

This command describes the proposed module; it is not available yet. Prefer kind-level support so users can choose names such as `utils` or `sdk`. Existing content modules for `domain`, `ai`, and `db` are identity-specific. Initially treat this module as a starter for a new package, rather than a supported conversion of those existing packages.

## What the existing examples show

| Example | Current behavior | Lesson for this scaffold |
| --- | --- | --- |
| Official shared package | Private, Effect dependency, shared TypeScript configuration; content modules export `src/*.ts` | Keep the existing private-package default. Publishing needs a separate selection. |
| `stack-effect` CLI | Bundled Node executable, shebang, `bin`, `dist` allowlist | Reuse the output boundary, but a library needs exports and portable declarations rather than executable setup. |
| `@stack-effect/author` | ESM root export, declarations, Effect peer, tsdown bundles private workspace packages, packed-consumer verification | Closest in-repository library precedent. Its bundling solves workspace dependencies that a fresh library need not have. |
| Effect Boxes | Explicit root and named subpath exports, tsdown JS build, separate declaration build, NodeNext compatibility check | Add explicit subpaths when needed. Do not copy its full SDK setup into the starter. |

Sources: [package target](../../catalogs/official/src/targetRegistry.ts), [package template](../../catalogs/official/templates/package/package.json), [package modules](../../catalogs/official/src/modules/packages.ts), [CLI manifest](../../apps/cli/package.json), [author manifest](../../packages/author/package.json), [author build](../../packages/author/tsdown.config.ts), [packed verification](../../packages/author/scripts/verify-package.ts), [Effect Boxes manifest](../../.reference/effect-boxes/packages/effect-boxes/package.json), [Effect Boxes build](../../.reference/effect-boxes/packages/effect-boxes/tsdown.config.ts). These are inspected local source snapshots, not claims about the latest remote releases.

## Generated structure

```text
packages/<name>/
  package.json
  README.md
  tsconfig.json
  tsconfig.build.json
  scripts/
    clean.mjs
  src/
    index.ts
  dist/                  # generated, ignored
    index.js
    index.d.ts
```

Start `src/index.ts` with `export {};` and a short instruction to add public exports. When adding a file, export it deliberately:

```ts
export { greet } from "./greet.js";
```

The `.js` spelling works with the emitted ESM files; TypeScript resolves the source to `greet.ts`. Root exports keep implementation files private to package consumers. Add a named package subpath only when it is a supported public entry point. [TypeScript library guidance](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html#im-writing-a-library), [Node package entry points](https://nodejs.org/api/packages.html#package-entry-points).

Proposed manifest core, with the publication name chosen by the author:

```json
{
  "name": "@your-scope/your-library",
  "version": "0.0.0",
  "private": false,
  "type": "module",
  "files": ["dist"],
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "node scripts/clean.mjs && tsc -p tsconfig.build.json",
    "type-check": "tsc --noEmit -p tsconfig.json",
    "prepack": "npm run build"
  }
}
```

The generated identity currently names packages `@repo/<name>`. Do not present that placeholder as a ready npm publication name. For the first version, document renaming it and updating workspace consumers before publishing. A future publish-name input should remain distinct from target identity and directory ownership. Do not invent an author, repository URL, or license; the README should list these publication setup steps. [Identity implementation](../../packages/domain/src/Catalog.ts), [npm package metadata](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/).

`files` limits shipped files, while npm includes package metadata, README, and license files automatically. `prepack` builds before npm packing or publishing. This proposed hook uses npm even in a Bun-authored workspace; npm is therefore required for this packaging workflow. Do not claim equivalent lifecycle behavior for every package manager without testing it. [npm package metadata](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/), [npm lifecycle scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/).

The library TypeScript configuration should extend the workspace base for strictness but override `module` and `moduleResolution` to `NodeNext`, enable `verbatimModuleSyntax`, and disable inherited declaration/source maps initially. The check configuration can include tests; the build configuration must include only `src`, set `rootDir: "src"`, `outDir: "dist"`, `noEmit: false`, `declaration: true`, and `composite: false`. Clean `dist` before a build using a small portable Node script so deleted source files cannot remain in the tarball. NodeNext follows newer Node semantics with compiler upgrades; a fixed Node mode is an alternative if the project establishes a supported Node baseline. The current shared base uses bundler resolution, which is inappropriate for checking unbundled Node ESM output. [Shared base](../../catalogs/official/templates/workspace/packages/config-typescript/base.json), [TypeScript guidance](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html#im-writing-a-library).

Use the workspace's selected TypeScript toolchain. Do not add a competing compiler version to every generated library. Keep the minimal library free of platform-specific runtime imports. Qualify npm publishing for Bun and Node workspace configurations first; Deno workspace support requires a separate check of compiler scripts and package lifecycle behavior.

For an Effect library, put Effect in both `peerDependencies` and `devDependencies`, using the catalog's qualified compatible version. The consumer supplies Effect and the development copy lets the library compile. Avoid unpublished `@repo/*` dependencies in emitted JavaScript or declarations. If the library later needs private workspace code, either publish that dependency or introduce deliberate JS and declaration bundling like `@stack-effect/author`. Do not automatically bundle all dependencies. [Author precedent](../../packages/author/package.json), [npm peer dependencies](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#peerdependencies).

## Catalog implementation constraint

`pkg-json-entry` currently accepts string values and only `exports`, `dependencies`, `devDependencies`, and `scripts`. It cannot express the manifest above, including nested export conditions, peer dependencies, `private`, or `files`. [Contribution contract](../../packages/domain/src/Catalog.ts).

Do not assume a second whole-file package manifest will safely override the package target's manifest. Before implementation, inspect and test how multiple authoritative file contributions are resolved. The durable approach is to extend typed package JSON composition to support the needed fields, with explicit conflicts when values differ. Keep the contracts in `@repo/domain` and the composition behavior in `@repo/scaffold`. Then let `package-library` contribute its publishing settings while retaining the private shared-package default.

This extension must preserve Selection, Blueprint, Plan, and Apply boundaries. Plan reports differences; Apply resolves conflicted paths. Peer dependency removal from the base `dependencies` field also needs an explicit supported operation or a library-specific base strategy. Adding a peer entry alone would leave the existing Effect runtime dependency in place. Do not hide this through a finalize script that rewrites package metadata. [Package template](../../catalogs/official/templates/package/package.json), [planning assessment](../../packages/scaffold/src/service/plan/PlanAssessor.ts).

A separate reusable `package-publish` configuration module makes sense after composition supports these changes and a second consumer needs it. For the initial feature, one library starter is easier to select and qualify. A new `library` target kind would currently map to `apps/library-*`; it would require changing path ownership rules to satisfy the requested `packages/` placement. [Target path implementation](../../packages/domain/src/Catalog.ts).

## Acceptance checks for implementation

1. Prototype concrete generated files in the catalog authoring workspace before editing templates.
2. Generate a new library with the proposed selection; verify placement, scripts, peer dependencies, and public exports.
3. Build, delete a source file, rebuild, and check that its previous output disappears.
4. Pack with npm, install the actual tarball into a disposable consumer, import the root in Node, and compile consumers using NodeNext and bundler resolution. Include a public type referring to Effect so declaration dependency checks exercise real behavior.
5. Confirm the tarball contains every exported file and no workspace-only runtime or declaration imports. Root exports should reject unpublished subpaths.
6. Run the catalog workspace validation, scoped catalog/scaffold/CLI tests for affected behavior, and the required repository format, lint, and type checks. Clean up consumer fixtures.

Defer CommonJS, wildcard export generation, browser bundles, Changesets, provenance workflows, and CI publication until requested. The first scaffold should prove that one small library can be built, packed, installed, imported, and type-checked.
