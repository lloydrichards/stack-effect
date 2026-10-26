import type { ChatMessage } from "@repo/domain/Chat";
import type { ChatTurnOptions } from "@repo/domain/ChatTurnOptions";
import { Effect } from "effect";
import type { Command } from "effect/cli";

export type ChatCommandAction =
  | { readonly _tag: "handled" }
  | {
      readonly _tag: "chat";
      readonly turnOptions?: ChatTurnOptions;
      readonly inputMessages?: ReadonlyArray<ChatMessage>;
      readonly providesInput?: boolean;
    };

export interface ChatCommandConfiguration<
  Config extends Command.Command.Config,
  R = never,
> {
  readonly flags: Config;
  readonly resolve: (
    options: Command.Command.Config.InferValue<Config>,
    mode: "ask" | "chat",
  ) => Effect.Effect<ChatCommandAction, Error, R>;
}

export const defaultChatCommandConfiguration: ChatCommandConfiguration<{}> = {
  flags: {},
  resolve: () => Effect.succeed({ _tag: "chat" }),
};
