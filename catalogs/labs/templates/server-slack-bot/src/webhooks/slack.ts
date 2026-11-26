// @effect-diagnostics unstableApiUsage:off This Labs module demonstrates the pinned Effect Chat API.
import * as SlackChat from "@effect/chat-slack/SlackChat";
import { Config, Effect, Layer } from "effect";
import { Chat, ChatHandler, ChatMessage } from "effect/chat";
import { Mac, SecureRandom } from "effect/crypto";
import { FetchHttpClient } from "effect/http";

const MentionReplies = ChatHandler.layer(
  Effect.fn("SlackBot.reply")(function* (event) {
    if (
      event._tag !== "MessageCreated" ||
      event.message.author.isBot ||
      !ChatMessage.mentionsSelf(event.message)
    ) {
      return;
    }

    const chat = yield* Chat.Chat;
    yield* chat.startThread(event.thread, event.message.id).pipe(
      Effect.flatMap((thread) =>
        chat.post(thread, { markdown: "Hello from Stack Effect!" }),
      ),
      Effect.tapError((error) =>
        Effect.logWarning("Slack reply failed").pipe(
          Effect.annotateLogs({ reason: error.reason._tag }),
        ),
      ),
      Effect.mapError(() => new ChatHandler.NotAccepted()),
    );
  }),
);

export const SlackBotRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const enabled = yield* Config.Boolean("SLACK_BOT_ENABLED").pipe(
      Config.withDefault(false),
    );
    if (!enabled) return Layer.empty;

    const options = yield* Config.all({
      appId: Config.String("SLACK_APP_ID"),
      teamId: Config.String("SLACK_TEAM_ID"),
      botToken: Config.Redacted("SLACK_BOT_TOKEN"),
      signingSecret: Config.Redacted("SLACK_SIGNING_SECRET"),
    });
    return SlackChat.layerWebhook({ ...options, path: "/webhooks/slack" }).pipe(
      Layer.provide(MentionReplies),
      Layer.provide(SlackChat.layer(options)),
      Layer.provide(Chat.layer),
      Layer.provide(
        Mac.layerWebCrypto.pipe(Layer.provide(SecureRandom.layerWebCrypto)),
      ),
      Layer.provide(FetchHttpClient.layer),
    );
  }),
);
