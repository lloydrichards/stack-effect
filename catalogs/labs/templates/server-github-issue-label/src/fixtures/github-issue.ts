// @effect-diagnostics nodeBuiltinImport:off Use independent signing primitives to generate fixture deliveries.
import { createHmac, randomBytes } from "node:crypto";
import { ConfigProvider, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { GitHubIssueWebhook } from "../webhooks/github";
import { GitHubLabelsDemo } from "../webhooks/issue-label";

const secret = randomBytes(32).toString("hex");
const app = HttpRouter.toWebHandler(
  GitHubIssueWebhook.pipe(
    Layer.provide(GitHubLabelsDemo),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ GITHUB_WEBHOOK_SECRET: secret }))),
  ),
  { disableLogger: true },
);

const opened = '{"action":"opened","repository":{"full_name":"demo/repo"},"issue":{"number":3}}';

async function deliver(label: string, body: string, signedBody = body) {
  const signature = createHmac("sha256", secret).update(signedBody).digest("hex");

  const response = await app.handler(new Request("http://localhost/webhooks/github", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-github-event": "issues",
      "x-hub-signature-256": `sha256=${signature}`,
    },
  }));

  await response.text();
  console.log(`${label}: HTTP ${response.status}`);
}

try {
  await deliver("Opened issue", opened);
  await deliver("Replay of the same issue", opened);
  await deliver("Closed issue", opened.replace("opened", "closed"));
  await deliver("Tampered delivery", opened + " ", opened);
  await deliver("Malformed issue event", "{}");
  await deliver("Oversized delivery", opened + " ".repeat(256 * 1024));
} finally {
  await app.dispose();
}
