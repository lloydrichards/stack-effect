import { Cause, Console, Effect, Predicate } from "effect";
import { Ansi, Box } from "effect-boxes";
import { Command } from "effect/cli";
import pkg from "../package.json";
import { stackEffectCommand } from "./command";

// Messages along the `cause` chain below `error`, outermost first.
// `Cause.prettyErrors` turns every cause into an `Error` and cuts cycles.
const causeMessages = (error: unknown): ReadonlyArray<string> => {
  const cause = Predicate.hasProperty(error, "cause") ? error.cause : undefined;
  return cause instanceof Error ? [cause.message, ...causeMessages(cause)] : [];
};

// Each cause once, skipping any that repeats a message above it.
const causeLines = (error: Error) =>
  [...new Set([error.message, ...causeMessages(error)])]
    .slice(1)
    .filter((message) => message.length > 0)
    .map((message) => `  Caused by: ${message}`);

export const cliProgram = stackEffectCommand.pipe(
  Command.run({ version: pkg.version }),
  Effect.catchCause((cause) => {
    if (Cause.hasInterruptsOnly(cause)) {
      const message = Box.vsep(
        [
          Box.text("Interrupted.").pipe(
            Box.annotate(Ansi.combine(Ansi.bold, Ansi.yellow)),
          ),
          Box.text("Goodbye! Come back when you're ready to stack."),
        ],
        1,
        Box.center1,
      ).pipe(
        Box.pad(0, 1),
        Box.border("rounded", { annotation: Ansi.yellow }),
        Box.moveDown(1),
      );
      return Console.log(`\n${Box.renderPrettySync(message)}`);
    }

    const message = Cause.prettyErrors(cause)
      .flatMap((error) =>
        error.message.length > 0 ? [error.message, ...causeLines(error)] : [],
      )
      .join("\n");

    return Console.error(
      message.length > 0 ? message : Cause.pretty(cause),
    ).pipe(
      Effect.andThen(
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    );
  }),
);
