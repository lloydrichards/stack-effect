import { Console, Effect } from "effect";
import { greet } from "{{packageName}}";

await Effect.runPromise(Console.log(greet("Effect")));
