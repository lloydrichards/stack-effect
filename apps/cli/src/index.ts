import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Cause, Console, Effect, Exit, Runtime } from "effect";

import { Argument, Command } from "effect/unstable/cli";

const greet = Command.make("greet", {
  name: Argument.string("name"),
}).pipe(
  Command.withDescription("Print a greeting"),
  Command.withHandler(({ name }) =>
    Effect.gen(function* () {
      yield* Console.log(`Hello, ${name}`);
    }),
  ),
);

const program = Command.run(greet, { version: "0.0.1" }).pipe(
  Effect.provide(BunServices.layer),
);

BunRuntime.runMain(program, {
  teardown: (exit, onExit) => {
    if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) {
      console.log("CLI interrupted, releasing console");
    }
    Runtime.defaultTeardown(exit, onExit);
  },
});
