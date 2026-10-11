import { Console, Effect } from "effect";
import { greet } from "{{packageName}}";

const message = await Effect.runPromise(greet("Effect"));
await Effect.runPromise(Console.log(message));
