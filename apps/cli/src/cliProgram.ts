import { Cause, Console, Effect } from "effect";
import { Ansi, Box } from "effect-boxes";
import { Command } from "effect/cli";
import pkg from "../package.json";
import { stackEffectCommand } from "./command";

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
      .map((error) => error.message)
      .filter((message) => message.length > 0)
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
