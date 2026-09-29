# @stack-effect/author

Author, validate, and build [Stack Effect](https://stack-effect.lloydrichards.dev) catalogs. Define targets and modules in TypeScript, and keep generated file bodies in ordinary template files. The build produces a deterministic v1 catalog document that you can host as static JSON. The `stack-effect` CLI and Recipe Builder can then select it by URL.

## Install

```bash
npm install @stack-effect/author effect@4.0.0-rc.117 @effect/platform-node@4.0.0-rc.117
```

`effect` is a peer dependency pinned to one exact release. Effect 4 release candidates are not compatible with each other, so install the version the package names. You provide the platform layer, which supplies `FileSystem` and `Path`: `@effect/platform-node`, `-bun`, or `-browser`.

The platform packages accept later release candidates of their shared dependency. Pin it in `package.json` too, or npm may install a newer release candidate that does not type-check:

```json
{
  "overrides": { "@effect/platform-node-shared": "4.0.0-rc.117" }
}
```

With Bun, use `overrides` or `resolutions`. pnpm reads overrides from `pnpm-workspace.yaml`:

```yaml
overrides:
  "@effect/platform-node-shared": "4.0.0-rc.117"
```

## Build a catalog

```ts
// modules.ts
import { defineModules, templates } from "@stack-effect/author";

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
import { defineTargets } from "@stack-effect/author";

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
import { buildCatalog } from "@stack-effect/author";
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
import { buildCatalog, loadOfficialCatalog } from "@stack-effect/author";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
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

| Export | Purpose |
| --- | --- |
| `defineTargets`, `defineModules` | Group definitions under their source file (`import.meta.url`). |
| `templates` | Point a contribution field at a template file, resolved at build time. |
| `buildCatalog` | Validate the definitions and return `{ json, document, provenance }`. |
| `loadOfficialCatalog`, `OFFICIAL_CATALOG_URL` | Fetch the official document for `requires: ["official"]`. |
| `CatalogBuildError`, `OfficialCatalogUnavailable` | Typed failures. |
| `CatalogBuildIssue`, `CatalogBuildIssueCode`, `DefinitionProvenance`, `TemplateProvenance` | Schemas for build issues and provenance. |
| `CatalogInput`, `TargetInput`, `ModuleInput`, `ContributionInput`, `DefinitionGroup`, `TemplateRef`, `isTemplateRef` | Input types and the template reference guard. |
| `BuildCatalogOptions`, `BuildCatalogResult` | Types of `buildCatalog`'s options and result. |
| `CatalogDocument`, `CatalogIssueCode`, `CatalogIssueSubject` | The v1 document type, issue codes, and the schema naming an issue's definition. |

`buildCatalog` options:

- `catalogId` (required).
- `root`: the directory that must contain every source and template.
- `finalizeScripts`: `"reject"` by default, or `"allow"` to publish Finalize scripts. The CLI runs a custom catalog's scripts only with the user's consent.
- `requires` and `official`, as described above.

## Compatibility

- The package emits catalog `formatVersion: 1` with the v1 interpreter capabilities.
- It is ESM only and runs on Node 22.18+, Bun, and Deno. CI verifies it on Node 24.
- While the version is below 1.0, a minor release may change the API. The release notes say when it does.
