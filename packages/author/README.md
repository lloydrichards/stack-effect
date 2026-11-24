# @stack-effect/author

Author, validate, and build [Stack Effect](https://stack-effect.lloydrichards.dev) catalogs. Define targets and modules in TypeScript, and keep generated file bodies in ordinary template files. The build produces a deterministic v1 catalog document that you can host as static JSON. The `stack-effect` CLI and Recipe Builder can then select it by URL.

## Install

```bash
npm install @stack-effect/author effect@4.0.6 @effect/platform-node@4.0.6
```

`effect` is a peer dependency pinned to one exact release. Install the exact Effect version declared by the package to keep authoring schemas and platform services compatible. You provide the platform layer, which supplies `FileSystem` and `Path`: `@effect/platform-node`, `-bun`, or `-browser`.

Pin the shared platform dependency in `package.json` too so it stays aligned with the Effect version used by the author package:

```json
{
  "overrides": { "@effect/platform-node-shared": "4.0.6" }
}
```

With Bun, use `overrides` or `resolutions`. pnpm reads overrides from `pnpm-workspace.yaml`:

```yaml
overrides:
  "@effect/platform-node-shared": "4.0.6"
```

## Build a catalog

```ts
// modules.ts
import { defineModules } from "@stack-effect/author/Define";
import { templates } from "@stack-effect/author/Template";

const template = templates(new URL("./templates/", import.meta.url));

export const modules = defineModules(import.meta.url, [
  {
    id: "acme-api-rest",
    title: "REST API",
    description: "Adds a REST entry point",
    supportedOn: [{ _tag: "kind", kind: "api" }],
    dependencies: [],
    contributions: [
      { _tag: "file", path: "{{targetPath}}/src/rest.ts", contents: template("./rest.ts") },
    ],
  },
]);
```

```ts
// templates/rest.ts, embedded byte for byte
export const rest = "REST entry point";
```

```ts
// targets.ts
import { defineTargets } from "@stack-effect/author/Define";

export const targets = defineTargets(import.meta.url, [
  {
    kind: "api",
    title: "API",
    description: "An HTTP API application",
    defaultName: "server",
    contributions: [],
  },
]);
```

```ts
// build.ts
import { NodeServices } from "@effect/platform-node";
import { buildCatalog } from "@stack-effect/author/Build";
import { Effect } from "effect";
import { mkdir, writeFile } from "node:fs/promises";
import { modules } from "./modules.ts";
import { targets } from "./targets.ts";

const { json } = await Effect.runPromise(
  buildCatalog(
    { targets: [targets], modules: [modules] },
    { catalogId: "acme", root: new URL("./", import.meta.url) },
  ).pipe(Effect.provide(NodeServices.layer)),
);
await mkdir("dist", { recursive: true });
await writeFile("dist/catalog.json", json);
```

A failed build raises `CatalogBuildError`. Each issue names its `code`, the definition, and the source file. When a template is involved, the issue names the template too.

Paths and contents can use tokens such as `targetPath` or `packageName` in double braces. Any other double-brace text, such as a JSX style object or a GitHub Actions expression, fails as an unsupported token, and v1 has no escape yet ([#304](https://github.com/lloydrichards/stack-effect/issues/304)).

## Extend the official catalog

A catalog may reference official targets and modules if it declares `requires: ["official"]`. Validation composes your definitions with the official document. The output never embeds official definitions.

```ts
import { NodeServices } from "@effect/platform-node";
import { buildCatalog } from "@stack-effect/author/Build";
import { loadOfficialCatalog } from "@stack-effect/author/Official";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { modules } from "./modules.ts";

const catalog = { targets: [], modules: [modules] };
const root = new URL("./", import.meta.url);

const program = Effect.gen(function* () {
  const official = yield* loadOfficialCatalog();
  return yield* buildCatalog(catalog, { catalogId: "ext", root, requires: ["official"], official });
}).pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer)));
```

Consumers must select the official catalog too, for example `--catalog official --catalog ext=<url>`.

## API

Each concept is its own subpath. The package root re-exports all of them, so `import { buildCatalog } from "@stack-effect/author"` also works.

| Subpath | Export | Purpose |
| --- | --- | --- |
| `/Define` | `defineTargets`, `defineModules` | Group definitions under their source file (`import.meta.url`). |
| `/Define` | `CatalogInput`, `TargetInput`, `ModuleInput`, `ContributionInput`, `DefinitionGroup` | Input types. |
| `/Template` | `templates` | Point a contribution field at a template file, resolved at build time. |
| `/Template` | `TemplateRef`, `isTemplateRef` | The template reference type and its guard. |
| `/Build` | `buildCatalog` | Validate the definitions and return `{ json, document, provenance }`. |
| `/Build` | `BuildCatalogOptions`, `BuildCatalogResult` | Types of `buildCatalog`'s options and result. |
| `/Build` | `CatalogBuildError` | Typed build failure. |
| `/Build` | `CatalogBuildIssue`, `CatalogBuildIssueCode`, `DefinitionProvenance`, `TemplateProvenance` | Schemas for build issues and provenance. |
| `/Build` | `CatalogDocument`, `CatalogIssueCode`, `CatalogIssueSubject` | The v1 document type, issue codes, and the schema naming an issue's definition. |
| `/Official` | `loadOfficialCatalog`, `OFFICIAL_CATALOG_URL` | Fetch the official document for `requires: ["official"]`. |
| `/Official` | `OfficialCatalogUnavailable` | Typed fetch failure. |

`buildCatalog` options:

- `catalogId` (required).
- `root`: the directory that must contain every source and template.
- `finalizeScripts`: `"reject"` by default, or `"allow"` to publish Finalize scripts. The CLI runs a custom catalog's scripts only with the user's consent.
- `requires` and `official`, as described above.

## Compatibility

- The package emits catalog `formatVersion: 1` with the v1 interpreter capabilities.
- It is ESM only and runs on Node 22.18+, Bun, and Deno. CI verifies it on Node 24.
- While the version is below 1.0, a minor release may change the API. The release notes say when it does.
