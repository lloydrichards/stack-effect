import { BunServices } from "@effect/platform-bun";
import { Console, Effect, String as Str } from "effect";
import { TextArea } from "./src/components/TextArea";

const main = Effect.gen(function* () {
  yield* Console.log("TextArea Scratchpad\n");

  const defaultCode = Str.stripMargin(
    `|const greet = (name: string) => {
    |  console.log(\`Hello, \${name}!\`)
    |  return name.toUpperCase()
    |}
    |
    |greet("world")`,
  );

  const result = yield* TextArea({
    message: "Edit the snippet:",
    default: defaultCode,
    placeholder: "Type something here...",
    minRows: 3,
    maxRows: 6,
  });

  yield* Console.log(`\nYou entered:\n${result}`);
});

void Effect.runPromise(main.pipe(Effect.provide(BunServices.layer))).catch(
  (error) => {
    console.error("Error in TextArea Scratchpad:", error);
  },
);
