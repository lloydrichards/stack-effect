// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Cluster.
import { IncrementCounterRpc } from "@repo/domain/CounterRpc";
import { Effect, Ref } from "effect";
import { Entity } from "effect/cluster";

export const CounterEntity = Entity.make("Counter", [IncrementCounterRpc]);

export const CounterEntityLayer = CounterEntity.toLayer(
  Effect.gen(function* () {
    // Cluster builds a handler for each active entity ID.
    const count = yield* Ref.make(0);

    return {
      Increment: () => Ref.updateAndGet(count, (value) => value + 1),
    };
  }),
);
