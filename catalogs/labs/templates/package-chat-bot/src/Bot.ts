// @effect-diagnostics unstableApiUsage:off This Labs module uses the pinned Effect Chat API.
import { Effect } from "effect";
import { Chat, type ChatMessage, type ChatThread } from "effect/chat";

/** Post the bot's response to a message admitted by an integration. */
export const reply = Effect.fn("ChatBot.reply")(function* (
  thread: ChatThread.ChatThread,
  message: ChatMessage.ChatMessage,
) {
  const botMentions = message.mentions
    .filter((mention) => mention.isSelf)
    .sort((left, right) => right.start - left.start);
  const text = botMentions
    .reduce(
      (text, mention) => text.slice(0, mention.start) + text.slice(mention.end),
      message.text,
    )
    .trim();
  const markdown =
    text.toLowerCase() === "ping" ? "pong" : "Say `ping` to try the bot.";

  const chat = yield* Chat.Chat;
  yield* chat.post(thread, { markdown });
});
