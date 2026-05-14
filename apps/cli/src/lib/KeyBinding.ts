/**
 * KeyBinding — single-source-of-truth for key definitions.
 *
 * Each KeyBinding carries the terminal key names used for matching in process
 * handlers **and** the display label + action text rendered in hint bars.
 * This ensures hints and handlers can never drift out of sync.
 *
 * @module
 */

import type { Terminal } from "effect";
import { Effect, Match, Schema } from "effect";

// ─── Schema Class ────────────────────────────────────────────────────────────

export class KeyBinding extends Schema.Class<KeyBinding>("KeyBinding")({
  /** Terminal key names that trigger this binding (e.g. ["enter", "return"]). */
  keys: Schema.Array(Schema.String),
  /** Display label for the key shown in hints (e.g. "enter", "↑/↓", "ctrl+d"). */
  label: Schema.String,
  /** Short action description shown in hints (e.g. "submit", "navigate"). */
  action: Schema.String,
  /** Whether the binding is active. Disabled bindings are hidden in hints and ignored by `matches`. */
  enabled: Schema.Boolean.pipe(
    Schema.optional,
    Schema.withConstructorDefault(Effect.succeed(true)),
  ),
  /** Required modifier keys. Omitted or false means the modifier must NOT be held. */
  ctrl: Schema.Boolean.pipe(
    Schema.optional,
    Schema.withConstructorDefault(Effect.succeed(false)),
  ),
  meta: Schema.Boolean.pipe(
    Schema.optional,
    Schema.withConstructorDefault(Effect.succeed(false)),
  ),
  shift: Schema.Boolean.pipe(
    Schema.optional,
    Schema.withConstructorDefault(Effect.succeed(false)),
  ),
}) {
  /**
   * Returns true when the user input satisfies this binding's key names and
   * modifier requirements. The `enabled` flag only affects hint visibility,
   * not matching.
   */
  matches(input: Terminal.UserInput): boolean {
    return (
      this["keys"].includes(input.key.name) &&
      (this["ctrl"] ?? false) === input.key.ctrl &&
      (this["meta"] ?? false) === input.key.meta &&
      (this["shift"] ?? false) === input.key.shift
    );
  }
}

// ─── KeyMap helpers ──────────────────────────────────────────────────────────

/** A record of named KeyBindings for a component. */
export type KeyMap = Record<string, KeyBinding>;

/**
 * Return the first binding from a keymap that matches the given input.
 * Useful for process handlers that need to identify which binding fired.
 */
export const findBinding = (
  keymap: KeyMap,
  input: Terminal.UserInput,
): KeyBinding | undefined =>
  Object.values(keymap).find((binding) => binding.matches(input));

/**
 * Derive a new keymap with selected bindings enabled or disabled.
 *
 * ```ts
 * const keys = withEnabled(SelectKeys, { Prev: false, Submit: true });
 * ```
 */
export const withEnabled = <K extends KeyMap>(
  keymap: K,
  overrides: Partial<Record<keyof K, boolean>>,
): K => {
  const result = { ...keymap };
  for (const [name, enabled] of Object.entries(overrides)) {
    const binding = result[name as keyof K];
    if (binding) {
      result[name as keyof K] = new KeyBinding({
        ...binding,
        enabled: enabled as boolean,
      }) as K[keyof K];
    }
  }
  return result;
};

// ─── Match combinator ────────────────────────────────────────────────────────

/**
 * Match combinator that tests a `Terminal.UserInput` against a `KeyBinding`.
 *
 * Use inside `Match.value(input).pipe(...)` where `input` is `Terminal.UserInput`:
 *
 * ```ts
 * Match.value(input).pipe(
 *   whenBinding(SelectKeys.Down, () => Action.NextFrame({ state: next })),
 *   whenBinding(SelectKeys.Submit, () => Action.Submit({ value })),
 *   Match.orElse(() => Action.NextFrame({ state })),
 * );
 * ```
 */
export const whenBinding = <Ret>(
  binding: KeyBinding,
  f: (input: Terminal.UserInput) => Ret,
) => Match.when((input: Terminal.UserInput) => binding.matches(input), f);
