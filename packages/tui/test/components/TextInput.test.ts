import { stripVTControlCharacters } from "node:util";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { Prompt } from "effect/cli";
import { TestConsole } from "effect/testing";
import { TextInput } from "../../src/components/TextInput.js";
import * as MockTerminal from "../services/MockTerminal.js";
import { TestLayer } from "../services/TestLayer.js";

describe("TextInput", () => {
  it.effect("submits typed text", () =>
    Effect.gen(function* () {
      const prompt = TextInput({ message: "Name" });

      yield* MockTerminal.inputText("he");
      yield* MockTerminal.inputKey("x", { ctrl: true });
      yield* MockTerminal.inputKey("y", { meta: true });
      yield* MockTerminal.inputText("llo");
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "hello");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("submits default value when no input given", () =>
    Effect.gen(function* () {
      const prompt = TextInput({ message: "Name", default: "world" });

      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "world");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("submits default value on escape", () =>
    Effect.gen(function* () {
      const prompt = TextInput({ message: "Name", default: "fallback" });

      yield* MockTerminal.inputText("ignored");
      yield* MockTerminal.inputKey("escape");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "fallback");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("handles backspace correctly", () =>
    Effect.gen(function* () {
      const prompt = TextInput({ message: "Name" });

      yield* MockTerminal.inputText("hexlo");
      yield* MockTerminal.inputKey("left");
      yield* MockTerminal.inputKey("left");
      yield* MockTerminal.inputKey("backspace");
      yield* MockTerminal.inputText("l");
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "hello");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("cursor navigation with left/right", () =>
    Effect.gen(function* () {
      const prompt = TextInput({ message: "Name" });

      yield* MockTerminal.inputText("abde");
      yield* MockTerminal.inputKey("left");
      yield* MockTerminal.inputKey("left");
      yield* MockTerminal.inputKey("left");
      yield* MockTerminal.inputKey("right");
      yield* MockTerminal.inputText("c");
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "abcde");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("home and end keys", () =>
    Effect.gen(function* () {
      const prompt = TextInput({ message: "Name" });

      yield* MockTerminal.inputText("bc");
      yield* MockTerminal.inputKey("home");
      yield* MockTerminal.inputText("a");
      yield* MockTerminal.inputKey("end");
      yield* MockTerminal.inputText("d");
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "abcd");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("validate rejects and shows error, then resubmit succeeds", () =>
    Effect.gen(function* () {
      const prompt = TextInput({
        message: "Name",
        validate: (v) =>
          v.length >= 3 ? Effect.succeed(v) : Effect.fail("Too short"),
      });

      yield* MockTerminal.inputText("ab");
      yield* MockTerminal.inputKey("enter"); // rejected
      yield* MockTerminal.inputText("c");
      yield* MockTerminal.inputKey("enter"); // accepted

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "abc");
      const frames = (yield* TestConsole.logLines).map((line) =>
        stripVTControlCharacters(String(line)),
      );
      const rejected = frames.findIndex((frame) => frame.includes("Too short"));
      assert.isAtLeast(rejected, 0);

      const corrected = frames
        .slice(rejected + 1)
        .find((frame) => frame.includes("abc"));
      assert.isDefined(corrected);
      assert.notInclude(corrected, "Too short");
    }).pipe(Effect.provide(TestLayer)),
  );
});
