# {{packageName}}

Shared Effect package for workspace consumers.

See the [project README]({{projectRoot}}/README.md) for installation and workspace commands.

## Use and extend

Put each public API in a named file such as `src/X.ts`. Keep its schemas, types, typed errors, and usage examples with the API. If the implementation grows, put private code in `src/internal/x.ts`. Add an export such as `"./X": "./src/X.ts"` to `package.json` so workspace consumers can import the module by subpath.

For local experiments, keep a `scratchpad.ts` at the package root. If a module adds a `scratch` script, run `{{runCommand}} scratch` from this directory.

For Bun or Node projects, select **Publishable Library** to add a build that emits JavaScript and TypeScript declarations and a pack script that creates an npm tarball.

{{#if module=domain-api-contracts}}`@repo/domain/Api` defines the base HTTP API. Update its server handlers and clients together when contracts change.
{{/if}}{{#if module=domain-todo-contracts}}`@repo/domain/Todo` defines todo schemas, identifiers, inputs, and errors.
{{/if}}{{#if module=domain-todo-http-contracts}}`@repo/domain/TodoApi` defines the typed todo HTTP endpoints.
{{/if}}{{#if module=package-db-sqlite}}
## SQLite storage

Run from this directory:

```sh
{{runCommand}} db:migrate
{{runCommand}} db:health
```

The default database is `<project-root>/data/app.sqlite`; migrations live in `{{targetPath}}/src/migrations`. Defaults resolve from the nearest `stack.effect.json` above the module, independently of the working directory.

`DATABASE_FILE` overrides the database path; explicit relative paths use the process working directory. `MIGRATIONS_DIRECTORY` overrides the migration directory and must be absolute.

The health command and API startup apply pending migrations. For deployment, preserve the project marker and migration assets, or set absolute paths to both resources.
{{/if}}{{#if module=package-db-postgres}}
## Postgres setup

From this directory, copy `.env.example` to `.env` and update the connection settings. Ensure the consuming process loads those values. Start Postgres from the project root:

```sh
docker compose -f {{targetPath}}/docker-compose.yml up -d
```

Then run from this directory:

```sh
{{runCommand}} db:migrate
{{runCommand}} db:health
```

Add migrations under `src/migrations/`. Deploy them beside the database module in its `migrations` directory; the Postgres loader resolves this location relative to the module.
{{/if}}{{#if module=package-db-todo-repository}}
Use `TodoRepository.layer` for Todo persistence. The consuming app provides the database and secure random Layers.
{{/if}}
Run `{{runCommand}} type-check` from this directory to check TypeScript. This package has no separate development server.
