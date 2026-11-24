import {
  McpPromptDescriptor,
  McpPromptOptionError,
  McpPromptSelection,
} from "@repo/domain/McpPrompt";
import { Effect, Option, Schema } from "effect";
import { Flag } from "effect/cli";

export const mcpPromptOptions = {
  prompt: Flag.String("prompt").pipe(
    Flag.withSchema(Schema.NonEmptyString),
    Flag.optional,
  ),
  promptArgs: Flag.KeyValuePair("prompt-arg").pipe(Flag.withDefault({})),
  listPrompts: Flag.Boolean("list-prompts").pipe(Flag.withDefault(false)),
};
export const promptSelection = Effect.fn("McpPromptOptions.selection")(
  function* (options: {
    prompt: Option.Option<string>;
    promptArgs: Record<string, string>;
    listPrompts: boolean;
  }) {
    const name = Option.getOrUndefined(options.prompt);
    const hasArgs = Object.keys(options.promptArgs).length > 0;
    if (name === undefined && hasArgs)
      return yield* new McpPromptOptionError({
        message: "--prompt-arg requires --prompt",
      });
    if (options.listPrompts && (name !== undefined || hasArgs))
      return yield* new McpPromptOptionError({
        message: "Use --list-prompts separately from --prompt and --prompt-arg",
      });
    if (name === undefined) return undefined;
    return McpPromptSelection.make({ name, arguments: options.promptArgs });
  },
);
export const encodePromptList = Schema.encodeEffect(
  Schema.fromJsonString(Schema.Array(McpPromptDescriptor), { space: 2 }),
);
