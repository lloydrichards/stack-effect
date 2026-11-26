# Apply an issue label from a GitHub webhook

Run `{{runCommand}} fixture:github` from this server directory. The fixture creates a local secret and calls the generated adapter in process. An opened issue and its replay each log a `triage` decision and return HTTP 204. A closed issue logs no decision. Tampered, malformed, and oversized deliveries return 401, 400, and 413, respectively.

Configure the GitHub webhook to send `application/json`. To run the server with this module, set `GITHUB_WEBHOOK_SECRET` and run `{{runCommand}} dev`. The route verifies the original body bytes against `X-Hub-Signature-256` before decoding the event. `chooseIssueLabel` takes the repository and issue number from the decoded event. It returns a fixed allowlisted label.

`GitHubLabels.layer` logs the label decision. To enable writes, follow the note in `GitHubLabels.add` in `src/webhooks/issue-label.ts`. Replace the log with an authenticated call to GitHub's add-labels endpoint. Keep repeat deliveries safe by adding the same label. The example handles each delivery inline. A durable queue would let the route acknowledge deliveries before applying labels and retry application failures separately.

See [GitHub's webhook signature guide](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) and [label API](https://docs.github.com/en/rest/issues/labels#add-labels-to-an-issue).
