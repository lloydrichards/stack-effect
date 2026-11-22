# Run the receipt workflow from a browser

Start the server from this app directory. Allow the origins of the generated clients you plan to run.

```bash
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5174 {{runCommand}} dev
```

Start each selected client with `{{runCommand}} dev` from its app directory. React defaults to port 3000 and Foldkit to port 5174. To change a client port, include the new origin in `ALLOWED_ORIGINS`. Set `VITE_SERVER_URL` on a client if the API runs somewhere other than `http://localhost:9000`.

Submit two fresh receipt IDs while the first is still **Pending**. Each row polls its own execution. Refresh to restore the browser history and resume polling any pending rows. Submitting the same receipt ID rejoins the same execution and keeps one row.

## Follow the request

1. The client uses `@repo/domain/ReceiptApi` to send `POST /receipts`. The server starts or rejoins a workflow and returns HTTP 202 with the execution ID.
2. The workflow records the receipt idempotently and waits five seconds before confirming. The server hosts a local Cluster runner for the workflow. It stores workflow state and receipts in `data/receipt-workflow.sqlite` relative to the workspace root by default. Set `WORKFLOW_DATABASE_FILE` to an absolute writable path to override the default.
3. The client polls `GET /receipts/:executionId` every half second until it gets a confirmation or a failure. The status route reports **Pending** whenever there is no result yet, including for an unknown execution ID. The browser stops polling after 30 seconds and lets you refresh to check again.

The React and Foldkit forms use the same typed HTTP client helper. React polls from an effect, while Foldkit models submission and polling as commands. Browser code stays independent of SQLite and Cluster.

{{#if runtime=deno}}## Configure a compiled server

A compiled Deno server requires `WORKFLOW_DATABASE_FILE` to point to an absolute writable path outside the executable. Set it before running the binary.

## Add receipts to an existing Deno server

If Stack Effect reports a manifest conflict, skip the override. Override replaces the entire `package.json`. The `--yes` option skips conflicted files.

1. In this server's `package.json`, add `"@repo/db": "workspace:*"` and `"@repo/workflow": "workspace:*"` to the existing `dependencies`.
2. Keep the generated `deno.json` tasks, which grant SQLite FFI access. If you already have a `deno.json`, add `--allow-ffi` before the entry point in your existing `dev` and `dev:watch` tasks. Add it to your `deno compile` command if needed.
3. If Stack Effect skipped the domain manifest, add `"./Receipt": "./src/Receipt.ts"` and `"./ReceiptApi": "./src/ReceiptApi.ts"` to `exports` in `packages/domain/package.json`.
4. Resolve any other conflicts reported by `stack-effect add`. Run `deno install` from the workspace root before starting the server.
{{/if}}
