import { Console, Effect } from "effect";
import type { Command } from "effect/cli";
import { McpPrompts } from "./McpPrompts";
import type {
  ChatCommandAction,
  ChatCommandConfiguration,
} from "../chat/ChatCommand";
import {
  encodePromptList,
  mcpPromptOptions,
  promptSelection,
} from "./McpPromptOptions";

export const withMcpPromptCommands = <Config extends Command.Command.Config, R>(
  base: ChatCommandConfiguration<Config, R>,
): ChatCommandConfiguration<
  {
    base: Config;
    mcp: typeof mcpPromptOptions;
  },
  R | McpPrompts
> => ({
  flags: { base: base.flags, mcp: mcpPromptOptions },
  resolve: (options, mode) =>
    Effect.gen(function* () {
      const selection = yield* promptSelection(options.mcp);
      if (options.mcp.listPrompts) {
        const prompts = yield* McpPrompts;
        yield* Console.log(yield* encodePromptList(yield* prompts.list()));
        return { _tag: "handled" } as const;
      }
      const action = yield* base.resolve(options.base, mode);
      if (action._tag === "handled" || selection === undefined) return action;
      if (mode === "ask") {
        return {
          ...action,
          turnOptions: { ...action.turnOptions, prompt: selection },
          providesInput: true,
        } satisfies ChatCommandAction;
      }
      const prompts = yield* McpPrompts;
      const messages = yield* prompts.render(selection);
      return {
        ...action,
        inputMessages: [...(action.inputMessages ?? []), ...messages],
        providesInput: true,
      } satisfies ChatCommandAction;
    }),
});
