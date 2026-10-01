import { Effect, String } from "effect";
import { Command } from "effect/cli";
import { TerminalChatDriver, TerminalChatDriverLive } from "../chat/ChatDriver";
import { TerminalChat } from "../chat/TerminalChat";

const chatSystemPrompt = String.stripMargin(`
    |You are a terminal chat assistant. Keep answers direct and practical.
    |Do not format in markdown unless the user explicitly requests it.
  `);

export const chat = Command.make("chat", {}, () =>
  Effect.gen(function* () {
    const driver = yield* TerminalChatDriver;
    yield* TerminalChat(driver.streamTurn, chatSystemPrompt);
  }).pipe(Effect.provide(TerminalChatDriverLive)),
).pipe(Command.withDescription("Open an interactive terminal chat"));
