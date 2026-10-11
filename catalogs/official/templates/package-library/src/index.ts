import { Effect } from "effect";

export const greet = Effect.fnUntraced(function* (name: string) {
  return yield* Effect.succeed(`Hello, ${name}!`);
});
