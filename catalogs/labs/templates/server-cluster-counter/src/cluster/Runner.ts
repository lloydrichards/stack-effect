// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Cluster.
import { Layer } from "effect";
import { MessageStorage, RunnerHealth, Runners, RunnerStorage, Sharding, ShardingConfig } from "effect/cluster";
import { CounterEntityLive } from "./Counter";

const RunnerLive = Sharding.layer.pipe(
  Layer.provideMerge(Runners.layerNoop),
  Layer.provideMerge(MessageStorage.layerMemory),
  Layer.provide([RunnerStorage.layerMemory, RunnerHealth.layerNoop]),
  Layer.provide(ShardingConfig.layerFromEnv()),
);

// Register any additional entity layers here to share this server's runner.
export const ClusterLive = CounterEntityLive.pipe(
  Layer.provideMerge(RunnerLive),
);
