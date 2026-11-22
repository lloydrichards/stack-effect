# Apply an issue label from a GitHub webhook

From this server directory, run `{{runCommand}} test src/webhooks/github.test.ts`. A local secret signs a fixture for `POST /webhooks/github`. The fixture client records one `triage` decision for an opened issue. Tampered signatures, unsupported events, and malformed bodies make no label calls. Replaying the fixture yields the same decision.

Configure the GitHub webhook to send `application/json`. To run the server with this module, set `GITHUB_WEBHOOK_SECRET` and run `{{runCommand}} dev`. The route verifies the original body bytes against `X-Hub-Signature-256` before decoding the event. `chooseIssueLabel` takes the repository and issue number from the decoded event. It returns a fixed allowlisted label.

The generated `GitHubLabelsDemo` layer logs what it would do. To enable writes, replace it in `RouterDependencies` with a layer that calls GitHub's add-labels endpoint. Keep repeat calls safe by adding the same label. The example handles each delivery inline. A durable queue would let the route acknowledge deliveries before applying labels and retry application failures separately.

See [GitHub's webhook signature guide](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) and [label API](https://docs.github.com/en/rest/issues/labels#add-labels-to-an-issue).
