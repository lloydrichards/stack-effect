// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Cluster.
import { Rpc } from "effect/rpc";
import { CounterCount } from "./Counter";

export const IncrementCounterRpc = Rpc.make("Increment", {
  success: CounterCount,
});
