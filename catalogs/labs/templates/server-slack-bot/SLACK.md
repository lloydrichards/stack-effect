# Connect the Chat Bot to Slack

The Slack integration turns a bot mention into a threaded reply. Change the reply in `packages/chat-bot/src/Bot.ts` at the workspace root.

1. Set up a public HTTPS URL that forwards to this server. The default server port is `9000`. In `slack-app.yml`, set the request URL to your public HTTPS URL followed by `/webhooks/slack`.
2. In [Slack app settings](https://api.slack.com/apps), create an app from the manifest. Install it to your workspace.
3. From this server directory, copy `.env.slack.example` to `.env` and fill in the values. If you already have a `.env`, add the Slack settings to it.
   - Use the App ID and Signing Secret from **Basic Information**.
   - Use the Bot User OAuth Token from **OAuth & Permissions**.
   - Set `SLACK_TEAM_ID` to your Slack workspace ID. You can find it in a Slack web URL such as `https://app.slack.com/client/T123…/…`.
4. Load the environment and start the server.

   ```sh
   set -a
   . ./.env
   set +a
   {{runCommand}} dev
   ```

5. In **Event Subscriptions**, verify the request URL and confirm that the app subscribes to the bot event `app_mention`. Invite the bot to a channel and send `@Stack Effect Chat Bot ping`. The bot replies `pong` in the thread.
6. Edit the response in `packages/chat-bot/src/Bot.ts`, restart the server, and send another mention to see your change.

Slack can retry deliveries, and this starter can send duplicate replies. Keep the handler fast enough to reply within the webhook deadline. For slower work, acknowledge after handing the event to a durable inbox that deduplicates deliveries.
