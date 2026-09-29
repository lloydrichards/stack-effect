---
type: Decision
title: Catalog source selection
description: Accepted public model for selecting, composing, and trusting named HTTP catalogs in stack.effect.json, the CLI, and Recipe Builder.
status: stable
sources:
  - id: design
    resource: https://github.com/lloydrichards/stack-effect/issues/276
  - id: definitions
    resource: ../../packages/domain/src/Catalog.ts
  - id: source-contract
    resource: ../../packages/domain/src/CatalogSource.ts
  - id: config
    resource: ../../packages/domain/src/Scaffold.ts
  - id: compose
    resource: ../../packages/catalog/src/composeCatalog.ts
  - id: loader
    resource: ../../packages/scaffold/src/service/catalog/CatalogLoader.ts
  - id: selection
    resource: ../../apps/cli/src/service/CatalogSelection.ts
  - id: cli-sources
    resource: ../../apps/cli/src/lib/catalogSources.ts
  - id: finalize
    resource: ../../packages/scaffold/src/service/finalize/FinalizeService.ts
  - id: graph
    resource: ../../apps/cli/src/commands/graph.ts
generated: { by: claude, at: "2026-09-29T18:00:00+02:00" }
---

# Catalog source selection

Status: Partially implemented: Recipe Builder and `plan --format tree` render the create command without the `--trust` note.

This decision extends the [distribution decision](catalog-distribution.md "extends its official-source policy"), whose official-only behavior stays the default. [Catalog loading](catalog-loading.md "implements the per-source loading") describes the services that carry it out, and [catalog sources](../domain/catalog-sources.md "defines the source contracts") defines its vocabulary.

## Select sources as an ordered list of names

`stack.effect.json` has an optional `catalogs` array. Each entry names one source:

```json
{
  "catalogs": [
    { "name": "official" },
    { "name": "acme", "url": "https://catalog.acme.dev/registry/v1/catalog.json" }
  ]
}
```

- If `catalogs` is absent, the project uses the official source. Existing configs keep working unchanged.
- An empty `catalogs` array is a validation error. It never falls back to the official source.
- `official` is a reserved name, and its entry takes no `url`. Giving it a `url` is an error. To use a mirror or a staging deployment, add it as a custom entry under another name. The application supplies the official URL: the fixed production URL in the CLI, and the same-origin registry in Recipe Builder.
- Custom names match `^[a-z][a-z0-9-]{0,31}$`.
- A URL must use `https:`. Plain `http:` is allowed only for loopback hosts (`localhost`, `127.0.0.1`, `[::1]`), for local preview. `file:` URLs, relative references, URLs with user info, and URLs with a fragment are rejected. Query strings are allowed. URLs are compared exactly as written, without normalization.
- These are all validation errors, reported before any fetch: a repeated name, the same URL under two names, and a repeated entry.
- List order has no meaning for composition. It keeps output and diagnostics deterministic and is saved exactly as the user wrote it. There is no override order.

A source name only records where definitions came from. It never appears in recipe strings (`<kind>/<name>:<moduleId>`), target kinds, module IDs, or output paths, and it grants no precedence. It also grants no script trust, except for the reserved `official` name.

## Apply CLI input before reading the catalog

The CLI accepts a repeatable `--catalog` flag. Pass `official`, or `<name>=<url>` for a custom source:

```bash
stack-effect create my-app --catalog official --catalog acme=https://catalog.acme.dev/registry/v1/catalog.json
```

- `init` and `create`: the `--catalog` flags define the exact source set. The command saves them to `catalogs`. Without `--catalog`, the command writes no `catalogs` key.
- Re-running `init` on a project without `--catalog` keeps the project's saved `catalogs`.
- Other commands (`add`, `plan`, `graph`, `schema`, and `catalog workspace`) read `catalogs` from the project at `--root`, or at the current directory when `--root` is not given. A `plan` config on stdin that lists no `catalogs` keeps the project's saved sources. If `--catalog` is passed and its set differs from the saved set, the command fails with a named error. To change sources, edit `stack.effect.json`. An absent list counts as the set `[official]`.
- The CLI resolves the configuration and the source set into a `CatalogSelection` before any other work. Only then does it load the catalog and construct the command's services.
- Rendered `create` commands include the `--catalog` flags. These are the commands shown by `renderCreateCommand` and by Recipe Builder.

CLIs released before source selection decode `stack.effect.json` without strict key checks. They ignore `catalogs`, plan against the official source, and may drop the key when they rewrite the file. This is an accepted exception to the rule that no selected source disappears silently. The release notes and the CLI reference name the minimum CLI version that reads `catalogs`.

## Declare dependencies on the official source

A v1 `CatalogDocument` has an optional top-level `requires` field. In v1, the only accepted value is `["official"]`. The field declares a dependency on another source. It is not an interpreter capability, and `requiredCapabilities` is unchanged. Only clients that can select custom sources ever load a document that uses the field.

- A custom document may reference the targets and modules it defines itself. It may also reference official definitions, if it declares `requires: ["official"]`.
- An undeclared reference to an official definition is an error, even when `official` is selected.
- A document cannot reference definitions in another custom source. When custom sources A and B are selected together, the catalog is the union of two independent catalogs.
- `conflictsWith` stays within one source. Conflicts must be symmetric, and one source cannot edit the other source's side, so a conflict with another source's module is a `cross-source-conflict` error.
- A document cannot require its own source, including the official document declaring `requires: ["official"]`.
- If a document declares `requires: ["official"]` and `official` is not selected, composition fails with `missing-source` before it checks any reference. The error names the source and suggests `--catalog official`. The official source is never added implicitly.
- Nothing fetches a URL that a document mentions.

Authoring validation and preview for a document that requires the official source load the official document, so references are checked the same way the CLI checks them. The build output never embeds official definitions.

## Load each source, then compose once

1. `CatalogLoader.loadSources` loads each selected source. The fetch, decode, capability check, and cache rules apply to each URL separately. Each source keeps its own cache entry, digest, freshness state, and warning.
2. Each document is decoded and checked on its own, for structure, `formatVersion`, and capabilities. No `CatalogService` exists yet.
3. `composeCatalog` composes all documents once. It checks `requires` against the selected set first, and fails with `missing-source` before any reference check. It rejects duplicate target kinds and module IDs as `duplicate-id`, naming both sources. It validates references against the union and the dependency rules above.
4. Composition records each target's and module's source. `CatalogService.getSource` exposes this record to diagnostics, `graph`, and Finalize.
5. `loadSources` returns a `LoadedCatalogSet`: one composed `CatalogService` and one `LoadedCatalogSource` per source, with its name, URL, `requires`, digest, freshness, and warning. The command or Builder session uses that one catalog throughout.

The outage policy applies to each source separately:

- If a transport failure or timeout blocks one source, use that source's validated, compatible cache. Warn with the source name, URL, and last validation time.
- An invalid document, an unsupported format or capability, or a permanent HTTP failure is always an error.
- If any selected source has no usable document, the whole operation fails. No source is ever dropped.
- Sources may have cache entries of different ages.
- If a stale source breaks a reference that the current document of another source relies on, the error names both sources and the freshness of each.

A compatible content update takes effect on the next command or session. A running operation keeps its catalog, and content is never pinned.

## Gate Finalize scripts at run time

- Custom catalogs may contribute Finalize scripts. The loader composes every selected source with scripts allowed; consent decides whether they run.
- `FinalizeService` records each collected script's source name, together with its `target` or `module` origin. The CLI resolves the URL from the loaded sources when it shows the script.
- The source is part of the script's deduplication key, so a custom script can never stand in for an official one.
- `--yes` accepts defaults and runs official scripts only.
- `--trust` also runs scripts from custom sources.
- Without `--trust`, an interactive run shows the prompt grouped by source, with each source's name, URL, and exact commands. Official scripts are preselected, and custom scripts start unselected.
- Without `--trust`, a non-interactive run skips custom scripts and prints them as next steps.
- Rendered commands never include `--trust`. When the selected sources contribute custom scripts, the rendered output adds a note that running them requires `--trust`.
- A cached document gets no special treatment, because consent happens when a script runs. The source's stale warning and the recorded digest identify what was loaded.
- The public authoring API supports `finalizeScripts: "allow"` and preserves each script's provenance.

JSON loading never runs remote code. Finalize scripts and the generated project's own scripts are executable output. The consent prompt is the only boundary. There is no sandbox or signature check.

## Create custom-only projects without official vocabulary

Every project still has a `workspace` target at `.`.

- When `official` is selected, the current tool defaults and implicit workspace module IDs apply. These are `StackConfigDefaults`, `WorkspaceModules`, and `workspace-devenv-git`.
- When `official` is not selected, none of those apply. The selected sources must supply a `workspace` target, and without one, `create` fails with a named error.
- A tool flag that names a module missing from the composed catalog fails.
- A custom-only config omits the `lint`, `format`, `test`, and `monorepo` fields.

## Report sources in every client

- CLI warnings and notices go to stderr, one line per source: `catalog <name> (<url>): <notice>`. Stdout stays machine-readable.
- Named errors carry the source name and URL. Composition errors carry every source involved.
- `plan --format raw|llm` includes `sources: [{ name, url, digest, freshness }]`.
- When a custom source is selected, `graph` shows the source of each target and module. Official-only output is unchanged.
- Recipe Builder shows which sources supplied the current choices and keeps stale and failed sources visible until generation.
- Recipe Builder accepts all four source sets. Without `official`, it hides the tool, database, and Git controls, because they name official modules, and it omits their fields and flags from the preview, command, and link. It keeps `official` selected while a loaded source declares `requires: ["official"]`, and a selection that fails for want of it offers to add it.
- Catalog fetches send no trace headers. They are not CORS-safelisted, so a browser would preflight each fetch and fail on hosts that allow only the cache validators.
- A browser fetch failure may come from CORS or from transport, and the browser cannot tell which. Its message names the source and URL and does not claim either cause.

## Carry sources in shared Builder links

- A shared link repeats a `catalog` parameter: `catalog=official`, or `catalog=acme=<url>`. A link without `catalog` parameters uses the official source.
- An older Builder rejects the unknown parameter, and that explicit failure is intended.
- Before loading a link that names a non-official URL, the Builder asks the visitor to confirm. Fetching exposes the visitor to that host, and links come from untrusted places.
- Reopening a link loads current content for the same source set. A link never silently changes its source set.

## Worked examples

The examples use:

- `acme`, a standalone catalog with a `workspace` target, an `api` target, and module `acme-api-rest`.
- `ext`, which declares `requires: ["official"]` and defines module `ext-auth`, supported on the official `server` target.
- `beta`, a standalone catalog with a `worker` target.

| Source set | Command or config | Result |
| --- | --- | --- |
| Official only | No `catalogs`, no `--catalog` | Current behavior. Nothing new is written. |
| Official + custom | `--catalog official --catalog ext=https://ext.dev/v1.json` | `ext-auth` resolves against official `server`. This is a valid reference across sources. `catalogs` saves both entries. |
| Custom only | `--catalog acme=https://acme.dev/v1.json` | A standalone catalog. The workspace comes from `acme`. No official IDs or tool fields are written. |
| Two custom | `--catalog acme=… --catalog beta=…` | The union of two independent catalogs. It is valid when no IDs collide. |

Failure cases:

- **Collision:** `acme` and `beta` both define target kind `api`. The operation fails with `duplicate-id`, naming `api`, `acme`, and `beta`.
- **Missing reference:** `ext` is selected without `official`. Composition fails with `missing-source` before any reference check, with an error like "`ext` requires the official catalog; add `--catalog official`". If `ext` omitted `requires` but still referenced `server`, the result would be `missing-reference`, naming `ext` and `server`.
- **Undeclared dependency:** `acme` references official module `server-http-api` without `requires`. The operation fails even with `official` selected.
- **Stale cache:** `ext` is unreachable, and its cache is two days old. The operation continues with the warning `catalog ext (https://ext.dev/v1.json): using cached data last validated <time>`. If the current official document removed a target that the cached `ext` references, the error names both sources and their freshness.
- **Unavailable source:** `beta` is unreachable, and it has no cache. The operation fails before any project writes, with an error naming `beta` and its URL.
- **Mismatched set:** in a project that saved `[official, ext]`, `add --catalog official` fails with a named error. The user edits `stack.effect.json` instead.

## Contracts by package

| Package | Contract |
| --- | --- |
| `@repo/domain` | `CatalogSource`, `CatalogSources`, and `StackConfig.catalogs`. `CatalogDocument.requires`. Source-aware `CatalogIssueCode` values. The generated `stack.effect.schema.json`. |
| `@repo/catalog` | `composeCatalog` with per-source `requires`, reference, and conflict rules. `CatalogService.getSource`. |
| `@repo/scaffold` | `CatalogLoader.loadSources` and per-source cache and freshness. Source-labelled Finalize scripts. |
| `stack-effect` CLI | `--catalog`, saving, and mismatch errors. `CatalogSelection`, custom-only `create`, the `--yes`/`--trust` split, source-grouped prompts, `plan` `sources`, and `graph` provenance. |
| Recipe Builder | Source selection UI, the `catalog` link parameter, confirmation before fetching a non-official URL, and source and cache visibility. |
| `@repo/authoring` | `requires: ["official"]`, `finalizeScripts: "allow"`, and validation against the official document. |

## Alternatives not selected

- An object keyed by name, or a list of bare URLs. The first hides order, and the second derives names implicitly.
- `--catalog` adding sources to the saved set, or quietly overriding it in an existing project. Both could plan against a set the config cannot reproduce.
- An empty list meaning the official source. That is an implicit fallback.
- An override order or first-wins precedence. Collisions stay errors.
- Qualifying target kinds or module IDs with source names such as `@acme/...`. Kinds determine output paths, and the recipe syntax has no room for a source.
- References between custom catalogs, or declared dependencies on sources other than `official`. Either would couple independently published catalogs, and each can be added later without changing the format.
- A config field requiring a minimum CLI version. The CLIs it targets would ignore it.
- `--yes` approving custom scripts. Automation would then run third-party code without an explicit opt-in.
- Per-source `--trust <name>` values. They are more precise, and they can be added later without breaking anything.
- Version pins, a version solver, a marketplace, private authentication, and automatic URL discovery. These stay out of scope, as in the distribution decision.
