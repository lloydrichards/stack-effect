import { Data, Schema } from "effect";

export const CounterId = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
).pipe(Schema.brand("CounterId"));

export const CounterCount = Schema.Int;

export const CounterState = Schema.Struct({
  id: CounterId,
  count: CounterCount,
});

export const CounterHistory = Schema.Array(CounterState);

export class InvalidCounterId extends Data.TaggedError("InvalidCounterId") {}
