import { Effect, String } from "effect";
import { Command } from "effect/cli";
import type { ChatCommandConfiguration as Configuration } from "../chat/ChatCommand";
import {
  ChatCommandConfiguration,
  ChatCommandDependencies,
} from "../chat/ChatCommandConfiguration";
import { TerminalChatDriver } from "../chat/ChatDriver";
import { TerminalChat } from "../chat/TerminalChat";

const chatSystemPrompt = String.stripMargin(`
    |You are a terminal chat assistant. Keep answers direct and practical.
    |Do not format in markdown unless the user explicitly requests it.
  `);

const makeChatCommand = <Config extends Command.Command.Config, R>(
  configuration: Configuration<Config, R>,
) =>
  Command.make("chat", { flags: configuration.flags }, ({ flags }) =>
    Effect.gen(function* () {
      const action = yield* configuration.resolve(flags, "chat");
      if (action._tag === "handled") return;
      const driver = yield* TerminalChatDriver;
      yield* TerminalChat(
        driver.streamTurn,
        chatSystemPrompt,
        action.inputMessages ?? [],
      );
    }).pipe(Effect.provide(ChatCommandDependencies)),
  ).pipe(Command.withDescription("Open an interactive terminal chat"));

export const chat = makeChatCommand(ChatCommandConfiguration);
