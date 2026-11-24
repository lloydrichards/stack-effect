import { type ChatFailure, ChatPreparationError } from "@repo/domain/Chat";
import { UnsupportedMcpContent } from "@repo/domain/McpClient";
import {
  McpPromptDescriptor,
  type McpPromptMessage,
  McpPromptSelection,
  McpPromptSelectionError,
} from "@repo/domain/McpPrompt";
import { Context, Effect, Layer, Schema } from "effect";
import { McpClient, type McpClientError } from "effect/ai";
import { McpClientLayer } from "./McpClient";

export class McpPrompts extends Context.Service<
  McpPrompts,
  {
    readonly list: Effect.Effect<
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
      | UnsupportedMcpContent
    >;
  }
>()("McpPrompts") {
  static readonly layer = Layer.effect(
    McpPrompts,
    Effect.gen(function* () {
      const client = yield* McpClient.McpClient;
      const list = client
        .listPrompts()
        .pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(Schema.Array(McpPromptDescriptor)),
          ),
          Effect.withSpan("McpPrompts.list"),
        );
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
              new UnsupportedMcpContent({
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
      return McpPrompts.of({ list, render });
    }),
  ).pipe(Layer.provide(McpClientLayer));
}

const preparationCode = (error: unknown): ChatFailure["code"] => {
  if (Schema.is(McpPromptSelectionError)(error) || Schema.isSchemaError(error))
    return "invalid-input";
  if (Schema.is(UnsupportedMcpContent)(error)) return "unsupported-content";
  return "remote-failure";
};

export const readMcpPrompt = Effect.gen(function* () {
  const prompts = yield* McpPrompts;
  return Effect.fn("McpPrompts.prepareTurn")(function* (
    selection?: McpPromptSelection,
  ) {
    if (selection === undefined) return [];
    return yield* prompts.render(selection).pipe(
      Effect.mapError(
        (error) =>
          new ChatPreparationError({
            reason: {
              code: preparationCode(error),
              message: error.message,
              source: selection.name,
            },
          }),
      ),
    );
  });
});
