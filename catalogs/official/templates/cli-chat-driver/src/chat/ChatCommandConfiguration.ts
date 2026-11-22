import { identity, Layer, pipe } from "effect";
import { defaultChatCommandConfiguration } from "./ChatCommand";
import { TerminalChatDriverLayer } from "./ChatDriver";

export const ChatCommandConfiguration = pipe(defaultChatCommandConfiguration, identity);
export const ChatCommandDependencies = Layer.mergeAll(TerminalChatDriverLayer);
