# Run the receipt workflow from a browser

From the workspace root, start the Bun server. Allow the origins of the generated clients you plan to run.

```bash
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5174 bun {{targetPath}}/src/index.ts
```

Start each selected client with `bun run dev` from its app directory. React defaults to port 3000 and Foldkit to port 5174. To change a client port, include the new origin in `ALLOWED_ORIGINS`. Set `VITE_SERVER_URL` on a client if the API runs somewhere other than `http://localhost:9000`.

Enter a fresh receipt ID and submit the form. Refresh while it shows **Pending**. The page uses the execution ID in the URL to pick up polling and shows the confirmation when the workflow finishes. Submit the same receipt ID again to get the same execution ID.

## Follow the request

1. The client uses `@repo/domain/ReceiptApi` to send `POST /receipts`. The server starts or rejoins a workflow and returns HTTP 202 with the execution ID.
2. The workflow records the receipt idempotently and waits five seconds before confirming. The Bun server hosts a local Cluster runner for the workflow. It stores workflow state and receipts in `data/receipt-workflow.sqlite` by default. Use `WORKFLOW_DATABASE_FILE` to choose another file.
3. The client polls `GET /receipts/:executionId` every half second until it gets a confirmation or a failure. The status route reports **Pending** whenever there is no result yet, including for an unknown execution ID. The browser stops polling after 30 seconds and lets you refresh to check again.

The React and Foldkit forms use the same typed HTTP client helper. React polls from an effect, while Foldkit models submission and polling as commands. Browser code stays independent of SQLite and Cluster.
