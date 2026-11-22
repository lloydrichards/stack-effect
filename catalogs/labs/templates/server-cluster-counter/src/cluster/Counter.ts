// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Cluster.
import { CounterCount } from "@repo/domain/Counter";
import { Effect, Ref } from "effect";
import { Entity } from "effect/cluster";
import { Rpc } from "effect/rpc";

export const CounterEntity = Entity.make("Counter", [
  Rpc.make("Increment", { success: CounterCount }),
]);

export const CounterEntityLive = CounterEntity.toLayer(
  Effect.gen(function* () {
    // Cluster builds a handler for each active entity ID.
    const count = yield* Ref.make(0);
    return {
      Increment: () => Ref.updateAndGet(count, (value) => value + 1),
    };
  }),
);
