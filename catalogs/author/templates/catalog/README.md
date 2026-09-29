# {{packageName}}

A standalone [Stack Effect](https://stack-effect.lloydrichards.dev) catalog. The
TypeScript definitions in `catalog/` and the files in `templates/` build a v1
JSON document that any static host can serve.

- `{{packageManager}} run validate` runs every build check and reports each
  issue where it happened.
- `{{packageManager}} run preview <spec>` shows the files a consumer would get,
  without writing them.
- `{{packageManager}} run build` writes `dist/registry/v1/catalog.json`.

## Layout

- `catalog/index.ts` collects the definition groups and sets the catalog ID.
- `catalog/starter.ts` defines a `workspace` target, an `app` target, and the
  `app-greeting` module.
- `templates/` holds the file contents. The build embeds each file byte for
  byte, so the workspace formatter and linter skip this directory.

## Change a template

1. Edit `templates/app-greeting/src/greeting.ts`.
2. Run `{{packageManager}} run preview app/:app-greeting`. The preview builds the
   catalog, serves it on a loopback port, and runs
   `stack-effect create --dry-run --show-files` against it. The new text appears
   under `apps/app-demo/src/greeting.ts`.
3. Run `{{packageManager}} run build`. The document now embeds the new text.

## Read a validation error

Change the module's `supportedOn` kind in `catalog/starter.ts` from `app` to
`ap`, then run `{{packageManager}} run validate`. It exits with code 1 and names
the definition source:

```text
Catalog build failed:
  catalog/starter.ts: Module app-greeting references missing target ap
```

Template problems also name the template file:

```text
Catalog build failed:
  catalog/starter.ts template templates/app-greeting/src/missing.ts: Module app-greeting contribution 0 contents template was not found
```

## Tokens

Contribution paths and contents can use tokens, which Stack Effect resolves
when a consumer creates a project. Write the token name in double braces, for
example `targetPath`, `targetName`, `packageName`, `projectName`, or `runtime`.
Stack Effect also resolved this project's own files when it created them, so
`catalog/tokens.ts` builds token text at runtime instead of writing it literally.
See the [`@stack-effect/author` README](https://www.npmjs.com/package/@stack-effect/author)
for the authoring API.

## Publish

Upload `dist/` to a static host that serves `application/json`. Consumers
select the catalog on its own, because it supplies its own `workspace` target:

```sh
stack-effect create my-app --catalog mine=https://example.com/registry/v1/catalog.json --target app/:app-greeting
```

## Extend the official catalog instead

To add modules to official targets rather than publish a standalone catalog:

1. Remove the `workspace` target from `catalog/starter.ts`.
2. Load the official document with `loadOfficialCatalog` from
   `@stack-effect/author`, and pass `requires: ["official"]` and
   `official` to `buildCatalog` in each script.
3. Add `--catalog=official` to the command in `scripts/preview.ts`.
4. Consumers then select both: `--catalog official --catalog mine=<url>`.
