import { assert, describe, it } from "@effect/vitest";
import { Match, Option, Terminal } from "effect";
import { KeyBinding, whenBinding } from "../../src/lib/KeyBinding.js";

const toInput = (
  name: string,
  modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {},
): Terminal.UserInput => ({
  input: Option.some(name),
  key: {
    name,
    ctrl: modifiers.ctrl ?? false,
    meta: modifiers.meta ?? false,
    shift: modifiers.shift ?? false,
  },
});

describe("KeyBinding", () => {
  describe("matches", () => {
    const binding = new KeyBinding({
      keys: ["enter", "return"],
      label: "enter",
      action: "submit",
    });

    it("matches when key name is in the keys list", () => {
      assert.isTrue(binding.matches(toInput("enter")));
      assert.isTrue(binding.matches(toInput("return")));
    });

    it("does not match when key name is not in the list", () => {
      assert.isFalse(binding.matches(toInput("space")));
      assert.isFalse(binding.matches(toInput("a")));
    });

    it("does not match when modifier is required but not pressed", () => {
      const ctrlBinding = new KeyBinding({
        keys: ["d"],
        label: "ctrl+d",
        action: "submit",
        ctrl: true,
      });
      assert.isFalse(ctrlBinding.matches(toInput("d")));
      assert.isTrue(ctrlBinding.matches(toInput("d", { ctrl: true })));
    });

    it("does not match when modifier is pressed but not required", () => {
      assert.isFalse(binding.matches(toInput("enter", { ctrl: true })));
    });
  });

  describe("whenBinding", () => {
    const down = new KeyBinding({
      keys: ["down", "j"],
      label: "↓",
      action: "down",
    });
    const up = new KeyBinding({ keys: ["up", "k"], label: "↑", action: "up" });

    it("dispatches to the correct branch", () => {
      const result = Match.value(toInput("j")).pipe(
        whenBinding(down, () => "went-down"),
        whenBinding(up, () => "went-up"),
        Match.orElse(() => "noop"),
      );
      assert.strictEqual(result, "went-down");
    });

    it("falls through to orElse when no binding matches", () => {
      const result = Match.value(toInput("x")).pipe(
        whenBinding(down, () => "went-down"),
        whenBinding(up, () => "went-up"),
        Match.orElse(() => "noop"),
      );
      assert.strictEqual(result, "noop");
    });
  });
});
