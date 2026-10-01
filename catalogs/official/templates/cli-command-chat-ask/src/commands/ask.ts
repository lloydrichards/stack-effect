import type { ChatStreamPart } from "@repo/domain/Chat";
import {
  Console,
  Effect,
  Match,
  Schema,
  Stdio,
  Stream,
  String,
} from "effect";
import { Argument, Command } from "effect/cli";
import { TerminalChatDriver, TerminalChatDriverLive } from "../chat/ChatDriver";

const message = Argument.String("message").pipe(
  Argument.withSchema(Schema.NonEmptyString),
  Argument.withDescription("Message to send to the assistant"),
);

const askSystemPrompt = String.stripMargin(`
    |You are running inside a non-interactive command-line ask command.
    |Produce command output, not a conversation.
    |Return exactly one complete response to the user's request, then stop.
    |Do not invite the user to continue chatting.
    |Do not offer further help.
    |Do not ask follow-up questions unless required for safety or correctness.
    |If the user's entire request is a greeting, return only a brief greeting and no other sentence.
    |Be concise and direct.
  `);

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
