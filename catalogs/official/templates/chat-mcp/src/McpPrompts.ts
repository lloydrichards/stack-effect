import { ChatPreparationError } from "@repo/domain/Chat";
import type { ChatTurnOptions } from "@repo/domain/ChatTurnOptions";
import { UnsupportedMcpContentError } from "@repo/domain/McpClient";
import {
  McpPromptDescriptor,
  type McpPromptMessage,
  McpPromptSelection,
  McpPromptSelectionError,
} from "@repo/domain/McpPrompt";
import { Context, type Duration, Effect, Layer, Schema } from "effect";
import { McpClient, type McpClientError, Prompt } from "effect/ai";
import { McpClientLive } from "./McpClient";

export interface McpPromptsShape {
  readonly list: (options?: {
    readonly timeout?: Duration.Input;
  }) => Effect.Effect<
    ReadonlyArray<McpPromptDescriptor>,
    McpClientError.McpClientError | Schema.SchemaError
  >;
  readonly render: (
    input: McpPromptSelection,
  ) => Effect.Effect<
    ReadonlyArray<McpPromptMessage>,
    | McpClientError.McpClientError
    | Schema.SchemaError
    | McpPromptSelectionError
    | UnsupportedMcpContentError
  >;
}

export const makeMcpPrompts: Effect.Effect<
  McpPromptsShape,
  never,
  McpClient.McpClient
> = Effect.gen(function* () {
  const client = yield* McpClient.McpClient;
  const list = Effect.fn("McpPrompts.list")(function* (options?: {
    readonly timeout?: Duration.Input;
  }) {
    return yield* client
      .listPrompts(options)
      .pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(Schema.Array(McpPromptDescriptor)),
        ),
      );
  });
  const render = Effect.fn("McpPrompts.render")(function* (
    input: McpPromptSelection,
  ) {
    const selection = yield* Schema.decodeEffect(McpPromptSelection)(input);
    const prompts = yield* client.listPrompts();
    const prompt = prompts.find((prompt) => prompt.name === selection.name);
    if (prompt === undefined)
      return yield* new McpPromptSelectionError({
        message: `MCP prompt "${selection.name}" was not found`,
      });
    const args = selection.arguments ?? {};
    const declared = prompt.arguments ?? [];
    const missing = declared.filter(
      (arg) => arg.required === true && !Object.hasOwn(args, arg.name),
    );
    const unknown = Object.keys(args).filter(
      (name) => !declared.some((arg) => arg.name === name),
    );
    if (missing.length > 0 || unknown.length > 0)
      return yield* new McpPromptSelectionError({
        message: `Invalid arguments for MCP prompt "${selection.name}": missing [${missing.map((arg) => arg.name).join(", ")}], unknown [${unknown.join(", ")}]`,
      });
    const result = yield* client.getPrompt({ prompt, arguments: args });
    return yield* Effect.forEach(result.messages, (message) => {
      if (message.content.type !== "text")
        return Effect.fail(
          new UnsupportedMcpContentError({
            capability: "prompt",
            source: selection.name,
            contentType: message.content.type,
            message: `MCP prompt ${selection.name} contains unsupported ${message.content.type} content`,
          }),
        );
      return Effect.succeed({
        role: message.role,
        content: message.content.text,
      });
    });
  });
  return { list, render };
});

export class McpPrompts extends Context.Service<McpPrompts, McpPromptsShape>()(
  "McpPrompts",
) {}

export const McpPromptsLive = Layer.effect(McpPrompts)(makeMcpPrompts).pipe(
  Layer.provide(McpClientLive),
);

export const makeMcpPromptPreparation = Effect.gen(function* () {
  const prompts = yield* McpPrompts;
  return Effect.fn("McpPrompts.prepareTurn")(function* (
    options: ChatTurnOptions,
  ) {
    if (options.prompt === undefined) return { inputMessages: [] };
    const messages = yield* prompts.render(options.prompt).pipe(
      Effect.mapError(
        (error) =>
          new ChatPreparationError({
            reason: {
              code:
                Schema.is(McpPromptSelectionError)(error) ||
                Schema.isSchemaError(error)
                  ? "invalid-input"
                  : Schema.is(UnsupportedMcpContentError)(error)
                    ? "unsupported-content"
                    : "remote-failure",
              message: error.message,
              source: options.prompt?.name,
            },
          }),
      ),
    );
    return {
      inputMessages: messages.map((message) =>
        message.role === "user"
          ? Prompt.userMessage({
              content: [Prompt.textPart({ text: message.content })],
            })
          : Prompt.assistantMessage({
              content: [Prompt.textPart({ text: message.content })],
            }),
      ),
    };
  });
});
