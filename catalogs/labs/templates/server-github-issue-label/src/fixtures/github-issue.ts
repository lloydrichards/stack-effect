// @effect-diagnostics nodeBuiltinImport:off Use independent signing primitives to generate fixture deliveries.
import { createHmac, randomBytes } from "node:crypto";
import { ConfigProvider, Console, Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { GitHubIssueWebhook } from "../webhooks/github";
import { GitHubLabels } from "../webhooks/issue-label";

const secret = randomBytes(32).toString("hex");
const app = HttpRouter.toWebHandler(
  GitHubIssueWebhook.pipe(
    Layer.provide(GitHubLabels.layer),
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({ GITHUB_WEBHOOK_SECRET: secret }),
      ),
    ),
  ),
  { disableLogger: true },
);

const opened =
  '{"action":"opened","repository":{"full_name":"demo/repo"},"issue":{"number":3}}';

const deliver = Effect.fnUntraced(
  function* (label: string, body: string, signedBody = body) {
    const signature = createHmac("sha256", secret).update(signedBody).digest(
      "hex",
    );

    const request = new Request("http://localhost/webhooks/github", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-github-event": "issues",
        "x-hub-signature-256": `sha256=${signature}`,
      },
    });
    const response = yield* Effect.promise(() => app.handler(request));

    yield* Effect.promise(() => response.text());
    yield* Console.log(`${label}: HTTP ${response.status}`);
  },
);

await Effect.runPromise(
  Effect.gen(function* () {
    yield* deliver("Opened issue", opened);
    yield* deliver("Replay of the same issue", opened);
    yield* deliver("Closed issue", opened.replace("opened", "closed"));
    yield* deliver("Tampered delivery", opened + " ", opened);
    yield* deliver("Malformed issue event", "{}");
    yield* deliver("Oversized delivery", opened + " ".repeat(256 * 1024));
  }).pipe(Effect.ensuring(Effect.promise(() => app.dispose()))),
);
