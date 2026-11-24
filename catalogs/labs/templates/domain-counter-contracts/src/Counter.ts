import { Schema } from "effect";

export const CounterId = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
).pipe(Schema.brand("CounterId"));

export const CounterCount = Schema.Int;

export const CounterState = Schema.Struct({
  id: CounterId,
  count: CounterCount,
});
export type CounterState = typeof CounterState.Type;

export const CounterHistory = Schema.Array(CounterState);
export type CounterHistory = typeof CounterHistory.Type;

export class InvalidCounterId extends Schema.TaggedError<
  InvalidCounterId,
  { readonly brand: unique symbol }
>()("InvalidCounterId", { cause: Schema.Defect() }) {}
