# {{packageName}}

Effect HTTP server using shared contracts from `@repo/domain`.

See the [project README]({{projectRoot}}/README.md) for installation and workspace commands. Run from this directory:

```sh
{{runCommand}} dev:watch
```

The server listens at `http://localhost:9000`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `9000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated browser origins allowed by CORS |

If you change the API address, update the web client's `VITE_SERVER_URL` too.

{{#if module=server-http-api-todos}}Todo endpoints live under `/todos/`. The API uses `@repo/db` and applies pending migrations at startup. See the [database guide]({{projectRoot}}/packages/db/README.md) for storage setup.
{{/if}}{{#if module=server-http-rpc-todos}}Todo RPC handlers use `@repo/db` and apply pending migrations at startup. See the [database guide]({{projectRoot}}/packages/db/README.md) for storage setup.
{{/if}}
## Edit the server

`src/index.ts` composes routers and service layers. Shared schemas and contracts live in `packages/domain` at the project root.

Run `{{runCommand}} build` to build the server or `{{runCommand}} type-check` to check TypeScript.
