import { stripVTControlCharacters } from "node:util";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { Prompt } from "effect/cli";
import { TestConsole } from "effect/testing";
import { Select } from "../../src/components/Select.js";
import * as MockTerminal from "../services/MockTerminal.js";
import { TestLayer } from "../services/TestLayer.js";

describe("Select", () => {
  const choices = [
    { title: "Alpha", value: "alpha" },
    { title: "Beta", value: "beta" },
    { title: "Gamma", value: "gamma" },
  ];

  it.effect("submits the first choice on immediate enter", () =>
    Effect.gen(function* () {
      const prompt = Select({ message: "Pick one", choices });

      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "alpha");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("navigates down and submits second choice", () =>
    Effect.gen(function* () {
      const prompt = Select({
        message: "Pick one",
        choices: choices.map((choice) => ({
          ...choice,
          description: `Details for ${choice.value}`,
        })),
      });

      yield* MockTerminal.inputKey("down");
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "beta");
      const frames = (yield* TestConsole.logLines).map((line) =>
        stripVTControlCharacters(String(line)),
      );
      assert.isTrue(
        frames.some(
          (frame) =>
            frame.includes("Pick one") && frame.includes("Details for alpha"),
        ),
      );
      assert.isTrue(
        frames.some(
          (frame) =>
            frame.includes("Details for beta") &&
            !frame.includes("Details for alpha"),
        ),
      );
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("navigates with j/k keys", () =>
    Effect.gen(function* () {
      const prompt = Select({ message: "Pick one", choices });

      yield* MockTerminal.inputKey("j");
      yield* MockTerminal.inputKey("j");
      yield* MockTerminal.inputKey("k");
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "beta");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("wraps around at the bottom", () =>
    Effect.gen(function* () {
      const prompt = Select({ message: "Pick one", choices });

      yield* MockTerminal.inputKey("down");
      yield* MockTerminal.inputKey("down");
      yield* MockTerminal.inputKey("down"); // wraps to 0
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "alpha");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("wraps around at the top", () =>
    Effect.gen(function* () {
      const prompt = Select({ message: "Pick one", choices });

      yield* MockTerminal.inputKey("up"); // wraps to last
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "gamma");
    }).pipe(Effect.provide(TestLayer)),
  );
});
