import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { Prompt } from "effect/unstable/cli";
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

  it.effect("space toggles current item", () =>
    Effect.gen(function* () {
      const prompt = MultiSelect({ message: "Pick", choices });

      yield* MockTerminal.inputKey("space"); // toggle Alpha
      yield* MockTerminal.inputKey("down");
      yield* MockTerminal.inputKey("down");
      yield* MockTerminal.inputKey("space"); // toggle Gamma
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.deepStrictEqual(result, ["alpha", "gamma"]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("'a' toggles all on, then off", () =>
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

  it.effect("respects min constraint (beeps on submit below min)", () =>
    Effect.gen(function* () {
      const prompt = MultiSelect({ message: "Pick", choices, min: 1 });

      // Try submit with 0 selected — should beep, not submit
      yield* MockTerminal.inputKey("enter");
      // Now select one and submit
      yield* MockTerminal.inputKey("space");
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
