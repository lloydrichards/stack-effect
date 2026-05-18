import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { Prompt } from "effect/unstable/cli";
import { TextInput } from "../../src/components/TextInput.js";
import * as MockTerminal from "../services/MockTerminal.js";
import { TestLayer } from "../services/TestLayer.js";

describe("TextInput", () => {
  it.effect("submits typed text", () =>
    Effect.gen(function* () {
      const prompt = TextInput({ message: "Name" });

      yield* MockTerminal.inputText("hello");
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

      yield* MockTerminal.inputText("helo");
      yield* MockTerminal.inputKey("backspace");
      yield* MockTerminal.inputText("lo");
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "hello");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("cursor navigation with left/right", () =>
    Effect.gen(function* () {
      const prompt = TextInput({ message: "Name" });

      yield* MockTerminal.inputText("ac");
      yield* MockTerminal.inputKey("left");
      yield* MockTerminal.inputText("b");
      yield* MockTerminal.inputKey("enter");

      const result = yield* Prompt.run(prompt);
      assert.strictEqual(result, "abc");
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
    }).pipe(Effect.provide(TestLayer)),
  );
});
