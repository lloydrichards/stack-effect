import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { Prompt } from "effect/unstable/cli";
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
      const prompt = Select({ message: "Pick one", choices });

      yield* MockTerminal.inputKey("down");
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "beta");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("navigates with j/k keys", () =>
    Effect.gen(function* () {
      const prompt = Select({ message: "Pick one", choices });

      yield* MockTerminal.inputKey("j");
      yield* MockTerminal.inputKey("j");
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "gamma");
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
