# {{packageName}}

React application built with Vite and Effect.

See the [project README]({{projectRoot}}/README.md) for installation and workspace commands. Run from this directory:

```sh
{{runCommand}} dev
```

Open [the web app](http://localhost:3000). Port 3000 must be available.

{{#if module=client-react-http-api}}The typed HTTP client calls the API at `http://localhost:9000` by default. Set `VITE_SERVER_URL` to use a different API address. Keep the API running when developing this app on its own.
{{/if}}{{#if module=client-react-http-api-todos}}The todo interface uses `@repo/domain/TodoApi` and stores data through the API. The API defaults to `http://localhost:9000`; set `VITE_SERVER_URL` to change it. Complete the database setup before using todos.
{{/if}}
## Edit the app

- `src/app.tsx` composes the page.
- `src/components/` holds UI components.
- `src/lib/` holds client utilities and Effect state.

Run `{{runCommand}} build` to build the app or `{{runCommand}} type-check` to check TypeScript.
