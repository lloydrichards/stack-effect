import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { Prompt } from "effect/unstable/cli";
import { HorizontalSelect } from "../../src/components/HorizontalSelect.js";
import * as MockTerminal from "../services/MockTerminal.js";
import { TestLayer } from "../services/TestLayer.js";

describe("HorizontalSelect", () => {
  const choices = [
    { title: "Client", value: "client" as const },
    { title: "Server", value: "server" as const },
    { title: "Package", value: "package" as const },
  ];

  it.effect("submits first choice on immediate enter", () =>
    Effect.gen(function* () {
      const prompt = HorizontalSelect({ message: "Target", choices });

      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "client");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("navigates right and submits", () =>
    Effect.gen(function* () {
      const prompt = HorizontalSelect({ message: "Target", choices });

      yield* MockTerminal.inputKey("right");
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "server");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("navigates left wraps around", () =>
    Effect.gen(function* () {
      const prompt = HorizontalSelect({ message: "Target", choices });

      yield* MockTerminal.inputKey("left"); // wraps to last
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "package");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("escape submits first choice", () =>
    Effect.gen(function* () {
      const prompt = HorizontalSelect({ message: "Target", choices });

      yield* MockTerminal.inputKey("right");
      yield* MockTerminal.inputKey("right");
      yield* MockTerminal.inputKey("escape");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "client");
    }).pipe(Effect.provide(TestLayer)),
  );
});
