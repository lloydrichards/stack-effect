# Slack Bot

Run `{{runCommand}} fixture:slack` from this server directory. The fixture runs the server’s Slack route layer in process with a fake Slack API. It checks that the route is disabled by default, that a signed mention produces one threaded reply when enabled, and that a tampered delivery returns HTTP 401.

## Connect a Slack app

1. In your Slack app, add the bot token scopes `app_mentions:read` and `chat:write`. Install the app in your workspace and invite the bot to a channel.
2. Set `SLACK_BOT_ENABLED=true`, `SLACK_APP_ID`, `SLACK_TEAM_ID`, `SLACK_BOT_TOKEN`, and `SLACK_SIGNING_SECRET` in the server environment. Use the Slack workspace ID for `SLACK_TEAM_ID`.
3. Run `{{runCommand}} dev` and expose the server at a public HTTPS URL. In Event Subscriptions, set the Request URL to that URL plus `/webhooks/slack`, then subscribe to the `app_mention` bot event.
4. Mention the bot in the channel. It replies with “Hello from Stack Effect!” in the thread.

Slack can redeliver events after a timeout. This example replies inline and can post twice if a delivery is retried. Use durable deduplication if your bot needs to handle retries without duplicate replies.
