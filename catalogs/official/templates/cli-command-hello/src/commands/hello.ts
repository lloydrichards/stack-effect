import { Console, Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";

const name = Argument.String("name").pipe(
  Argument.optional,
);

const shout = Flag.Boolean("shout").pipe(
  Flag.withDescription("Print the greeting in uppercase"),
  Flag.optional,
);

export const hello = Command.make("hello", { name, shout }, ({ name, shout }) =>
  Effect.gen(function* () {
    const greeting = `Hello, ${Option.getOrElse(name, () => "World")}!`;
    yield* Console.log(Option.getOrElse(shout, () => false) ? greeting.toUpperCase() : greeting);
  }),
).pipe(Command.withDescription("Print a greeting message"));
