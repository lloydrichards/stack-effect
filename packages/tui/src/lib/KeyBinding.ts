import type { Terminal } from "effect";
import { Effect, Match, Schema } from "effect";

export class KeyBinding extends Schema.Class<KeyBinding>("KeyBinding")({
  keys: Schema.Array(Schema.String),
  label: Schema.String,
  action: Schema.String,
  enabled: Schema.Boolean.pipe(
    Schema.optional,
    Schema.withConstructorDefault(Effect.succeed(true)),
  ),
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

/** A record of named KeyBindings for a component. */
export type KeyMap = Record<string, KeyBinding>;

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
