import { stripVTControlCharacters } from "node:util";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { Box } from "effect-boxes";
import { Prompt } from "effect/cli";
import { TestConsole } from "effect/testing";
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

  it.effect("scrolls overflowing content and submits the selected choice", () =>
    Effect.gen(function* () {
      const originalRows = Object.getOwnPropertyDescriptor(
        process.stdout,
        "rows",
      );
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          Object.defineProperty(process.stdout, "rows", {
            configurable: true,
            value: 14,
          });
        }),
        () =>
          Effect.sync(() => {
            if (originalRows) {
              Object.defineProperty(process.stdout, "rows", originalRows);
            } else {
              Reflect.deleteProperty(process.stdout, "rows");
            }
          }),
      );

      const rows = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
      const prompt = Confirm({
        message: "Continue?",
        initial: true,
        label: { confirm: "Proceed", deny: "Go back" },
        children: Box.vcat(
          rows.map((row) => Box.text(row)),
          Box.left,
        ),
      });

      yield* MockTerminal.inputKey("down");
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, true);
      const frames = (yield* TestConsole.logLines).map((line) =>
        stripVTControlCharacters(String(line)),
      );
      const activeFrames = frames.filter(
        (frame) => frame.includes("Proceed") && frame.includes("Go back"),
      );
      assert.deepStrictEqual(
        activeFrames.map((frame) => rows.filter((row) => frame.includes(row))),
        [rows.slice(0, 4), rows.slice(1)],
      );
      assert.isTrue(
        frames.some(
          (frame) =>
            frame.includes("Continue?") &&
            frame.includes("Proceed") &&
            !frame.includes("Go back"),
        ),
      );
    }).pipe(Effect.scoped, Effect.provide(TestLayer)),
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
