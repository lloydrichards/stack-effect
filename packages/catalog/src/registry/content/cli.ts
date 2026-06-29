export const cliPackageJsonContents = `{
  "name": "{{packageName}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "bin": {
    "{{packageName}}": "dist/index.js"
  },
  "scripts": {},
  "dependencies": {
    "@effect/platform-bun": "4.0.0-beta.80",
    "effect": "4.0.0-beta.80"
  },
  "devDependencies": {
    "@effect/language-service": "^0.85.1",
    "@repo/config-typescript": "workspace:*",
    "@types/bun": "^1.2.17",
    "typescript": "6.0.2",
    "vitest": "^4.1.4"
  }
}
`;

export const cliTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": {
    "rootDir": "../..",
    "outDir": "dist",
    "noEmit": true,
    "types": ["@types/bun"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
`;

/**
 * CLI index template with Effect CLI.
 *
 * This is a minimal CLI entrypoint that includes:
 * - A root command with version flag
 * - BunRuntime for execution
 *
 * Additional subcommands are added by modules.
 */
export const cliIndexContents = `import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

// ============================================================================
// Root Command
// ============================================================================

const root = Command.make("{{packageName}}");

// ============================================================================
// Program
// ============================================================================

// Subcommands - modules inject additional subcommands via Command.withSubcommands
const AllCommands = Command.withSubcommands([]);

root.pipe(
  AllCommands,
  Command.run({ version: "0.0.0" }),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
`;

/**
 * Hello command module template.
 *
 * A simple subcommand that prints a greeting message.
 */
export const cliHelloCommandContents = `import { Console, Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

const name = Argument.string("name").pipe(
  Argument.optional,
);

const shout = Flag.boolean("shout").pipe(
  Flag.withDescription("Print the greeting in uppercase"),
  Flag.optional,
);

export const hello = Command.make("hello", { name, shout }, ({ name, shout }) =>
  Effect.gen(function* () {
    const greeting = \`Hello, \${Option.getOrElse(name, () => "World")}!\`;
    yield* Console.log(Option.getOrElse(shout, () => false) ? greeting.toUpperCase() : greeting);
  }),
).pipe(Command.withDescription("Print a greeting message"));
`;

export const cliChatDriverContents = `import { AiChatService, AiChatServiceLive, FastModelLive } from "@repo/ai";
import type { ChatMessage, ChatStreamPart } from "@repo/domain/Chat";
import { Array, Context, Effect, Layer, Match, pipe, Stream } from "effect";
import { Prompt } from "effect/unstable/ai";

// The server runtime has a similar helper, but the CLI module must not depend on
// server/RPC modules. If this duplication grows after the interactive chat command
// lands, consider moving a pure conversion helper to a shared package boundary.
const toPromptMessage = (message: ChatMessage) => {
  return pipe(
    Match.value(message.role),
    Match.when("system", () =>
      Prompt.systemMessage({ content: message.content }),
    ),
    Match.when("user", () =>
      Prompt.userMessage({
        content: [Prompt.textPart({ text: message.content })],
      }),
    ),
    Match.when("assistant", () =>
      Prompt.assistantMessage({
        content: [Prompt.textPart({ text: message.content })],
      }),
    ),
    Match.exhaustive,
  );
};

export class TerminalChatDriver extends Context.Service<TerminalChatDriver>()(
  "TerminalChatDriver",
  {
    make: Effect.gen(function* () {
      const chat = yield* AiChatService;

      const streamTurn = (
        messages: ReadonlyArray<ChatMessage>,
      ): Stream.Stream<ChatStreamPart> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const promptMessages: Array<Prompt.Message> = pipe(
              messages,
              Array.map(toPromptMessage),
            );

            const queue = yield* chat
              .chat(promptMessages)
              .pipe(Effect.provide(FastModelLive), Effect.orDie);

            return Stream.fromQueue(queue);
          }),
        );

      return {
        streamTurn,
      } as const;
    }),
  },
) {}

export const TerminalChatDriverLive = Layer.effect(TerminalChatDriver)(
  TerminalChatDriver.make,
).pipe(Layer.provide(AiChatServiceLive));
`;

export const cliAskCommandContents = `import type { ChatStreamPart } from "@repo/domain/Chat";
import {
  Console,
  Effect,
  Match,
  Schema,
  Stdio,
  Stream,
  String,
} from "effect";
import { Argument, Command } from "effect/unstable/cli";
import { TerminalChatDriver, TerminalChatDriverLive } from "../chat/ChatDriver";

const message = Argument.string("message").pipe(
  Argument.withSchema(Schema.NonEmptyString),
  Argument.withDescription("Message to send to the assistant"),
);

const askSystemPrompt = String.stripMargin(\`
    |You are running inside a non-interactive command-line ask command.
    |Produce command output, not a conversation.
    |Return exactly one complete response to the user's request, then stop.
    |Do not invite the user to continue chatting.
    |Do not offer further help.
    |Do not ask follow-up questions unless required for safety or correctness.
    |If the user's entire request is a greeting, return only a brief greeting and no other sentence.
    |Be concise and direct.
  \`);

const failCommand = (message: string) =>
  Console.error(message).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exitCode = 1;
      }),
    ),
  );

export const ask = Command.make("ask", { message }, ({ message }) =>
  Effect.gen(function* () {
    const driver = yield* TerminalChatDriver;

    yield* driver
      .streamTurn([
        { role: "system", content: askSystemPrompt },
        { role: "user", content: message },
      ])
      .pipe(
        Stream.runForEach((part: ChatStreamPart) =>
          Match.value(part).pipe(
            Match.tag("text", ({ delta }) =>
              Stdio.Stdio.use((stdio) =>
                Stream.make(delta).pipe(Stream.run(stdio.stdout())),
              ),
            ),
            Match.tag("error", ({ message }) => failCommand(message)),
            Match.orElse(() => Effect.void),
          ),
        ),
      );
  }).pipe(
    Effect.catch((error) => failCommand(error.message)),
    Effect.provide(TerminalChatDriverLive),
  ),
).pipe(Command.withDescription("Ask the assistant a single question"));
`;
