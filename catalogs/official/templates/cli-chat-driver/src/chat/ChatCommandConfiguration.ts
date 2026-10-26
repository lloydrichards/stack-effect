import { identity, Layer, pipe } from "effect";
import { defaultChatCommandConfiguration } from "./ChatCommand";
import { TerminalChatDriverLive } from "./ChatDriver";

export const ChatCommandConfiguration = pipe(defaultChatCommandConfiguration, identity);
export const ChatCommandDependencies = Layer.mergeAll(TerminalChatDriverLive);
