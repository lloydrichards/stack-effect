import { Console, Effect, Layer, Option, Queue, Stdio, Terminal } from "effect";
import type * as Cause from "effect/Cause";
import { Command } from "effect/unstable/cli";
import { stackEffectCommand } from "../command";

export type ScriptedInput = {
  readonly key: string;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly shift?: boolean;
};

export type CommandAcceptanceResult = {
  readonly output: ReadonlyArray<string>;
};

const userInput = (input: ScriptedInput): Terminal.UserInput => ({
  input: Option.some(input.key),
  key: {
    name: input.key,
    ctrl: input.ctrl ?? false,
    meta: input.meta ?? false,
    shift: input.shift ?? false,
  },
});

/**
 * Runs the real CLI parser and handlers. Tests supply the command service layer;
 * this helper owns only deterministic terminal input and output capture.
 */
export const runCommandAcceptance = <R, E>(options: {
  readonly args: ReadonlyArray<string>;
  readonly inputs?: ReadonlyArray<ScriptedInput>;
  readonly services: Layer.Layer<R, E>;
}) =>
  Effect.gen(function* () {
    const output: Array<string> = [];
    const queue = yield* Queue.make<Terminal.UserInput, Cause.Done>();
    yield* Queue.offerAll(queue, (options.inputs ?? []).map(userInput));

    const terminal = Terminal.make({
      columns: Effect.succeed(100),
      rows: Effect.succeed(30),
      readInput: Effect.succeed(Queue.asDequeue(queue)),
      readLine: Effect.succeed(""),
      display: (text) => Effect.sync(() => output.push(String(text))),
    });
    const testConsole: Console.Console = Object.assign(Object.create(console), {
      log: (...values: ReadonlyArray<unknown>) =>
        output.push(values.map(String).join(" ")),
      error: (...values: ReadonlyArray<unknown>) =>
        output.push(values.map(String).join(" ")),
      warn: (...values: ReadonlyArray<unknown>) =>
        output.push(values.map(String).join(" ")),
    });

    const scriptedServices = Layer.mergeAll(
      Layer.succeed(Terminal.Terminal, terminal),
      Stdio.layerTest({ args: Effect.succeed([...options.args]) }),
      Layer.succeed(Console.Console, testConsole),
    );

    yield* Command.runWith(stackEffectCommand, { version: "test" })([
      ...options.args,
    ]).pipe(Effect.provide(Layer.merge(options.services, scriptedServices)));

    return { output } satisfies CommandAcceptanceResult;
  });
