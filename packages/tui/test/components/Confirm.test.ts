import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { Prompt } from "effect/unstable/cli";
import { Confirm } from "../../src/components/Confirm.js";
import * as MockTerminal from "../services/MockTerminal.js";
import { TestLayer } from "../services/TestLayer.js";

describe("Confirm", () => {
  it.effect(
    "submits true when cursor is on Yes (default initial=false toggles to Yes)",
    () =>
      Effect.gen(function* () {
        const prompt = Confirm({ message: "Continue?" });

        // initial=false means cursor starts on "No" (index 1)
        yield* MockTerminal.inputKey("left"); // move to "Yes" (index 0)
        yield* MockTerminal.inputKey("enter");

        const result = yield* Prompt.run(prompt);
        assert.strictEqual(result, true);
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("submits false on immediate enter when initial is false", () =>
    Effect.gen(function* () {
      const prompt = Confirm({ message: "Continue?" });

      // initial defaults to false, cursor at index 1 (No)
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, false);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("submits true on immediate enter when initial is true", () =>
    Effect.gen(function* () {
      const prompt = Confirm({ message: "Continue?", initial: true });

      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, true);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("submits false on escape regardless of cursor position", () =>
    Effect.gen(function* () {
      const prompt = Confirm({ message: "Continue?", initial: true });

      yield* MockTerminal.inputKey("escape");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, false);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("tab toggles between choices", () =>
    Effect.gen(function* () {
      const prompt = Confirm({ message: "Continue?", initial: true });

      // initial=true -> cursor at 0 (Yes), tab moves to 1 (No)
      yield* MockTerminal.inputKey("tab");
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, false);
    }).pipe(Effect.provide(TestLayer)),
  );
});
