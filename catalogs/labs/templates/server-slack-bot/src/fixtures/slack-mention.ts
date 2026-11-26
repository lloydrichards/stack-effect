import { Clock, ConfigProvider, Console, Effect, Layer } from "effect";
import { FetchHttpClient, HttpRouter } from "effect/http";
import { SlackBotRoutes } from "../webhooks/slack";

const appId = "A123";
const teamId = "T123";
const botUserId = "U123";
const channel = "C123";
const timestamp = "1794509200.000100";
const signingSecret = "local-slack-fixture-secret";
const posts: URLSearchParams[] = [];

const slackFetch = async (
  input: string | URL | Request,
  init?: RequestInit,
) => {
  const request =
    input instanceof Request
      ? new Request(input, init)
      : new Request(String(input), init);
  const url = new URL(request.url);
  if (
    url.origin !== "https://slack.com" ||
    request.headers.get("authorization") !== "Bearer xoxb-fixture"
  ) {
    return Response.json({ ok: false }, { status: 401 });
  }

  if (url.pathname === "/api/auth.test") {
    return Response.json({ ok: true, user_id: botUserId, team_id: teamId });
  }

  if (url.pathname === "/api/chat.postMessage") {
    posts.push(new URLSearchParams(await request.text()));
    return Response.json({ ok: true, channel, ts: "1794509200.000200" });
  }

  return Response.json({ ok: false }, { status: 404 });
};

const makeApp = (config: Record<string, string>) =>
  HttpRouter.toWebHandler(
    SlackBotRoutes.pipe(
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(config))),
      Layer.provide(
        Layer.succeed(
          FetchHttpClient.Fetch,
          // Bun requires fetch.preconnect even for an in-process transport.
          Object.assign(slackFetch, { preconnect: () => {} }),
        ),
      ),
    ),
    { disableLogger: true },
  );

const disabled = makeApp({});
const enabled = makeApp({
  SLACK_BOT_ENABLED: "true",
  SLACK_APP_ID: appId,
  SLACK_TEAM_ID: teamId,
  SLACK_BOT_TOKEN: "xoxb-fixture",
  SLACK_SIGNING_SECRET: signingSecret,
});

const body = JSON.stringify({
  type: "event_callback",
  api_app_id: appId,
  team_id: teamId,
  event_id: "Ev123",
  event: {
    type: "app_mention",
    channel,
    user: "U456",
    text: `<@${botUserId}> hello`,
    ts: timestamp,
  },
});

const deliver = Effect.fnUntraced(function* (
  app: ReturnType<typeof makeApp>,
  requestBody: string,
) {
  const now = yield* Clock.currentTimeMillis;
  const seconds = String(Math.floor(now / 1000));
  const response = yield* Effect.promise(async () => {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`v0:${seconds}:${body}`),
    );
    const signature = Array.from(new Uint8Array(mac), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    return app.handler(
      new Request("http://localhost/webhooks/slack", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-request-timestamp": seconds,
          "x-slack-signature": `v0=${signature}`,
        },
        body: requestBody,
      }),
    );
  });
  return response.status;
});

await Effect.runPromise(
  Effect.gen(function* () {
    const unavailable = yield* deliver(disabled, body);
    const rejected = yield* deliver(enabled, body + " ");
    const accepted = yield* deliver(enabled, body);
    const reply = posts[0];
    if (
      unavailable !== 404 ||
      rejected !== 401 ||
      accepted !== 200 ||
      posts.length !== 1 ||
      reply?.get("channel") !== channel ||
      reply.get("thread_ts") !== timestamp ||
      reply.get("text") !== "Hello from Stack Effect!"
    ) {
      return yield* Effect.die(
        new Error(
          `Expected HTTP 404, 401, 200, and one threaded reply. Got ${unavailable}, ${rejected}, ${accepted}, and ${posts.length} replies.`,
        ),
      );
    }

    yield* Console.log(
      "Slack route disabled by default. When enabled, it rejects tampered deliveries and replies in the signed mention’s thread.",
    );
  }).pipe(
    Effect.ensuring(
      Effect.promise(() =>
        Promise.all([disabled.dispose(), enabled.dispose()]),
      ),
    ),
  ),
);
