import { stripVTControlCharacters } from "node:util";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { Prompt } from "effect/cli";
import { TestConsole } from "effect/testing";
import { MultiSelect } from "../../src/components/MultiSelect.js";
import * as MockTerminal from "../services/MockTerminal.js";
import { TestLayer } from "../services/TestLayer.js";

describe("MultiSelect", () => {
  const choices = [
    { title: "Alpha", value: "alpha" },
    { title: "Beta", value: "beta" },
    { title: "Gamma", value: "gamma" },
  ];

  it.effect("submits empty array when nothing selected", () =>
    Effect.gen(function* () {
      const prompt = MultiSelect({ message: "Pick", choices });

      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.deepStrictEqual(result, []);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "space toggles enabled choices and leaves disabled choices unselected",
    () =>
      Effect.gen(function* () {
        const prompt = MultiSelect({
          message: "Pick",
          choices: [choices[0], { ...choices[1], disabled: true }, choices[2]],
        });

        yield* MockTerminal.inputKey("space"); // Select Alpha.
        yield* MockTerminal.inputKey("space"); // Deselect Alpha.
        yield* MockTerminal.inputKey("up"); // Wrap to Gamma.
        yield* MockTerminal.inputKey("down"); // Wrap to Alpha.
        yield* MockTerminal.inputKey("down");
        yield* MockTerminal.inputKey("space"); // Beta cannot be selected.
        yield* MockTerminal.inputKey("down");
        yield* MockTerminal.inputKey("space"); // Select Gamma.
        yield* MockTerminal.inputKey("down"); // Wrap to Alpha.
        yield* MockTerminal.inputKey("down"); // Move to Beta.
        yield* MockTerminal.inputKey("up");
        yield* MockTerminal.inputKey("space"); // Select Alpha again.
        yield* MockTerminal.inputKey("enter");

        const result = yield* Prompt.run(prompt);
        assert.deepStrictEqual(result, ["alpha", "gamma"]);
        const frames = (yield* TestConsole.logLines).map((line) =>
          stripVTControlCharacters(String(line)),
        );
        const firstSelection = frames.findIndex((frame) =>
          frame.includes("(1/3)"),
        );
        assert.isAtLeast(firstSelection, 0);
        assert.isTrue(
          frames
            .slice(firstSelection + 1)
            .some((frame) => frame.includes("(0/3)")),
        );
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("'a' selects all choices", () =>
    Effect.gen(function* () {
      const prompt = MultiSelect({ message: "Pick", choices });

      yield* MockTerminal.inputKey("a"); // select all
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.deepStrictEqual(result, ["alpha", "beta", "gamma"]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("'a' twice deselects all", () =>
    Effect.gen(function* () {
      const prompt = MultiSelect({ message: "Pick", choices });

      yield* MockTerminal.inputKey("a"); // select all
      yield* MockTerminal.inputKey("a"); // deselect all
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.deepStrictEqual(result, []);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "enforces the minimum on submit and the maximum when toggling",
    () =>
      Effect.gen(function* () {
        const prompt = MultiSelect({
          message: "Pick",
          choices,
          min: 1,
          max: 1,
        });

        // Try submit with 0 selected — should beep, not submit
        yield* MockTerminal.inputKey("enter");
        yield* MockTerminal.inputKey("space");
        yield* MockTerminal.inputKey("down");
        yield* MockTerminal.inputKey("space"); // A second choice exceeds the maximum.
        yield* MockTerminal.inputKey("enter");

        const result = yield* Prompt.run(prompt);
        assert.deepStrictEqual(result, ["alpha"]);
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("respects pre-selected choices", () =>
    Effect.gen(function* () {
      const prompt = MultiSelect({
        message: "Pick",
        choices: [
          { title: "Alpha", value: "alpha", selected: true },
          { title: "Beta", value: "beta" },
          { title: "Gamma", value: "gamma", selected: true },
        ],
      });

      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.deepStrictEqual(result, ["alpha", "gamma"]);
    }).pipe(Effect.provide(TestLayer)),
  );
});
