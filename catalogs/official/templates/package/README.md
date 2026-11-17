# {{packageName}}

Shared Effect package for workspace consumers.

See the [project README]({{projectRoot}}/README.md) for installation and workspace commands.

## Use and extend

Use this package for code shared by workspace consumers. Update public entry points in `package.json` when you expose new modules.

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

Add migrations under `src/migrations/`. Deploy migration assets with the application; use an absolute `MIGRATIONS_DIRECTORY` when overriding their location.
{{/if}}{{#if module=package-db-todo-repository}}
`TodoRepository` and `TodoRepositoryLive` implement todo persistence. Provide `DatabaseLive` to the repository layer in the consuming application.
{{/if}}
Run `{{runCommand}} type-check` from this directory to check TypeScript. This package has no separate development server.
