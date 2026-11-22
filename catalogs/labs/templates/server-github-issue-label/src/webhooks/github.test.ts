// @effect-diagnostics nodeBuiltinImport:off The fixture signs independently of the adapter.
// @effect-diagnostics asyncFunction:off The Vitest fixture awaits the web handler and its cleanup.
import { createHmac } from "node:crypto";
import { ConfigProvider, Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { expect, it } from "vitest";
import { GitHubIssueWebhook } from "./github";
import { chooseIssueLabel, GitHubLabels } from "./issue-label";

it("adds the same allowlisted label on replay and ignores rejected deliveries", async () => {
  const secret = "fixture-secret";
  const calls: Array<ReturnType<typeof chooseIssueLabel>> = [];
  const app = HttpRouter.toWebHandler(
    GitHubIssueWebhook.pipe(
      Layer.provide(
        Layer.succeed(GitHubLabels, {
          add: (decision) =>
            Effect.sync(() => {
              calls.push(decision);
            }),
        }),
      ),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ GITHUB_WEBHOOK_SECRET: secret }),
        ),
      ),
    ),
    { disableLogger: true },
  );
  const send = (body: string, event = "issues", signedBody = body) =>
    app.handler(
      new Request("http://localhost/webhooks/github", {
        method: "POST",
        body,
        headers: {
          "x-github-event": event,
          "x-hub-signature-256":
            "sha256=" +
            createHmac("sha256", secret).update(signedBody).digest("hex"),
        },
      }),
    );
  try {
    const opened =
      '{"action":"opened","repository":{"full_name":"demo/repo"},"issue":{"number":3,"title":"Café"}}';
    const expected = {
      label: "triage",
      repository: "demo/repo",
      issueNumber: 3,
    };
    expect((await send(opened)).status).toBe(204);
    expect(calls).toEqual([expected]);
    expect((await send(opened + " ", "issues", opened)).status).toBe(401);
    expect((await send(opened, "push")).status).toBe(204);
    expect((await send(opened.replace("opened", "closed"))).status).toBe(204);
    expect((await send("{}")).status).toBe(400);
    expect((await send(opened + " ".repeat(256 * 1024))).status).toBe(413);
    expect(calls).toEqual([expected]);
    expect((await send(opened)).status).toBe(204);
    expect(calls).toEqual([expected, expected]);
  } finally {
    await app.dispose();
  }
});
