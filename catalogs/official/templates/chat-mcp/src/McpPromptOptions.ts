import {
  McpPromptDescriptor,
  McpPromptOptionError,
  type McpPromptSelection,
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
    readonly prompt: Option.Option<string>;
    readonly promptArgs: Readonly<Record<string, string>>;
    readonly listPrompts: boolean;
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
    const selection: McpPromptSelection | undefined =
      name === undefined ? undefined : { name, arguments: options.promptArgs };
    return selection;
  },
);
export const encodePromptList = Schema.encodeEffect(
  Schema.fromJsonString(Schema.Array(McpPromptDescriptor), { space: 2 }),
);
