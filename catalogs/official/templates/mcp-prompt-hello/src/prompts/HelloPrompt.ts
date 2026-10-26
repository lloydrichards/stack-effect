import { GreetingPromptArguments } from "@repo/domain/McpServerPrompt";
import { Effect } from "effect";
import { McpServer } from "effect/ai";

export const HelloPromptLive = McpServer.prompt({
  name: "hello",
  description: "Ask the assistant to greet a person",
  parameters: GreetingPromptArguments.fields,
  content: ({ name }) =>
    Effect.succeed(`Greet ${name} warmly and briefly introduce yourself.`),
});
