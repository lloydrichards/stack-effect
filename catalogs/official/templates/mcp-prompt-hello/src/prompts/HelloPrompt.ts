import { Effect, Layer, Schema } from "effect";
import { McpServer } from "effect/ai";

export const HelloPromptLive = Layer.mergeAll(
  McpServer.prompt({
    name: "hello",
    description: "Greet a person and introduce the MCP server",
    parameters: {
      name: Schema.String.pipe(
        Schema.annotate({
          description: "The name of the person to greet",
        }),
      ),
    },
    content: ({ name }) =>
      Effect.succeed(`Hello, ${name}! Welcome to the Stack Effect MCP server.`),
  }),
);
