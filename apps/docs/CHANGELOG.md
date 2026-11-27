# @stack-effect/docs

## 0.6.0

### Minor Changes

- bab3846: Labs adds an Effect Graph task planner that orders prerequisites and reports missing tasks, duplicate IDs, and cycles.
- 2bf64a0: Labs adds a typed GraphQL client to Bun, Node, and Deno API servers. Selecting the client also installs the query endpoint, so one server demonstrates the complete lookup. Set `UPSTREAM_GRAPHQL_URL` to use a different endpoint.
- 76e762c: Labs adds a signed Discord PING/PONG example for Bun, Node, and Deno servers with a credential-free fixture.
- b0ccea9: Explicit app target names now determine the folder under apps/. Use a blank target name to keep the catalog default folder.
  
  `--target server/api:server-http-api` now generates `apps/api`. To add modules to an existing `apps/server-api` app, use `--target server/:server-http-api`. If a later add reports a conflict with an existing named app, include that app's target in the same command.
  
  For a previously generated custom app, move it to the new folder and update any workspace paths, imports, or scripts that reference the old folder before running `add`. The workspace package name stays the same.
  
  In custom catalogs, a required child module must support every target its parent supports. Widen the child's support or make it optional if it applies only to some targets.
- a05752a: Labs adds a signed GitHub issue webhook for Bun, Node, and Deno servers. A fixture client demonstrates applying one allowlisted label without writing to GitHub.
- 666a253: Breaking: the browser worker, managed chat runtime, and Web Fetch toolkit now come from Labs. To keep using them in an existing project, retain `official` and add `{ "name": "labs", "url": "https://stack-effect.lloydrichards.dev/registry/v1/labs.json" }` to `stack.effect.json` under `catalogs`.
  
  New Recipe Builder sessions start with both sources. Labs also adds a Bun PersistedQueue example with separate enqueue and consume commands backed by SQLite.
- f653e73: Labs adds an Effect Cluster counter for Bun, Node, and Deno servers and an optional CLI command. Run `counter a` twice and `counter b` once to see that each ID keeps its own count.
- 9fea5ae: The official catalog adds a Documentation Site target for Bun projects.
  
  Use `bunx stack-effect@latest create my-project --target docs/ --yes` to generate a static MDX site in `apps/docs`.
  
  Optional modules add Mermaid diagrams, an API reference, header pages, and a browser worker demo.
- 9d58269: Labs adds a GraphQL query module for Bun, Node, and Deno servers. Query one item through an Effect lookup service, and swap in your own service when you are ready to use real data.
- 1bb387b: The Labs Receipt Workflow forms for React and Foldkit now support Postgres. Choose SQLite or Postgres in Recipe Builder, or pass the database provider explicitly when creating the project from the CLI.
- 8aea206: Labs adds a durable receipt workflow for Bun, Node, and Deno. Run it from the CLI to see execution resume after a restart, or use the React and Foldkit forms to submit a receipt and follow its status after a refresh.
- 377a1db: Labs can generate a shared Chat Bot package and connect it to Slack. Install the generated Slack app, mention the bot with `ping`, and edit `Bot.ts` to customize its reply.
- 3e6ce86: Graph Task Planner is available on Bun, Node, and Deno shared packages and exports `TaskPlan` from publishable libraries.

### Patch Changes

- fcd6a81: New catalog registry projects import `@stack-effect/author` through its `Define`, `Template`, and `Build` subpaths and depend on `~0.6.0`.
- 5326799: The Labs Graph Task Planner documents its public API and includes a package-root scratchpad that demonstrates how to call it.
- 776e985: New projects use Effect 4.1.6. Catalog authors should install Effect 4.1.6 with the matching @stack-effect/author release.
- 58812b0: Recipe Builder shows targets required by selected modules under Your targets.
- 7106833: Generated projects and Recipe Builder previews omit empty layer placeholders when modules contribute real layers.
- 9a8e10f: New Nx projects with TypeScript 7 install successfully with npm.
- 95f7f7e: Reapplying Workshop Checklist now asks before replacing custom instructions.
- 9b22295: Recipe Builder shows why a catalog or preview failed under its message, one `Caused by:` line per underlying error.
- 241913d: Module names are easier to scan in Recipe Builder and the CLI, with shorter labels and clearer names for dependencies.

## 0.5.0

### Minor Changes

- f02e39e: Configure a recipe in two steps. Explore module dependencies inline and see which generated files change as you edit the recipe.

## 0.4.0

### Minor Changes

- 31102fa: The documentation now provides llms.txt, Markdown for every content page, and a copyable coding-agent prompt. Use Copy Markdown or View Markdown to read the current page as text.

## 0.3.0

### Minor Changes

- 3501041: Recipe Builder now loads the current catalog from the registry and can compose named catalogs.
  
  For example, adding the author catalog renders:
  
  ```bash
  bunx stack-effect@latest create my-catalog \
    --catalog official \
    --catalog author=https://stack-effect.lloydrichards.dev/registry/v1/author.json \
    --target catalog/registry:catalog-starter
  ```
  
  Add a catalog by name and URL, or remove the official catalog when every selected catalog stands on its own; tool, database, and Git options hide until it is added back. A catalog that requires the official one keeps it selected. Shared links carry the selection in repeatable `catalog` parameters and ask before loading a custom catalog. During a registry outage, the Builder uses its cached catalog and shows a notice.
- 86c2242: Host the catalog registry and add guides for catalog updates, offline use, and publishing your own catalog.
  
  ```bash
  curl -s https://stack-effect.lloydrichards.dev/registry/v1/author.json | head -c 200
  ```
  
  The official catalog is served at `/registry/v1/catalog.json`, the author catalog at `/registry/v1/author.json`, and the `stack.effect.json` schema at `/schemas/v1/stack.effect.schema.json`, with CORS and revalidation headers for browsers.

## 0.2.2

### Patch Changes

- 1cb5192: Add an optional Husky and lint-staged developer-experience module.

## 0.2.1

### Patch Changes

- 437ed2b: Preserve the selected Bun runtime when restoring Recipe Builder state.

## 0.2.0

### Minor Changes

- 935f120: New projects now default to Bun, TypeScript 7, Vite+, Oxlint, Oxfmt, and Vitest.

  Generated commands omit these choices when they match the defaults. To keep the previous TypeScript 6, Turbo, and Biome stack, pass the corresponding `create` or `init` options explicitly.

  The Recipe Builder uses the same defaults and keeps existing Nx shared links compatible by selecting TypeScript 6, which Nx currently requires.

- 10eec6c: The Recipe Builder can now keep valid selections in the URL and copy a shareable recipe link.

### Patch Changes

- 04e55bb: The Recipe Builder now requires a database provider before enabling SQL-backed modules and identifies which selected modules prevent removing it.
- 898cc16: remove flash when changing the target name through optimistic loading web worker

## 0.1.1

### Patch Changes

- 0111a72: align child modules with correct nesting in target config

## 0.1.0

### Minor Changes

- c37d8de: add landing page with interactive workbench
- ba3a35b: add generated reference docs for cli commands
- 1126a39: add an interactive recipe builder with live scaffold previews
- 6c4d516: Add the initial Stack Effect documentation site.

### Patch Changes

- d431650: use shiki for syntax highlighter of respository explorer
- edf00da: add event analitics to recipe builder
