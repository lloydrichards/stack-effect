// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Cluster.
import { BunCrypto } from "@effect/platform-bun";
import { SqliteLive } from "@repo/db";
import { Layer } from "effect";
import { SingleRunner } from "effect/cluster";
import { CounterEntityLive } from "./Counter";

const RunnerLive = SingleRunner.layer({ runnerStorage: "memory" }).pipe(
  Layer.provide([SqliteLive, BunCrypto.layerDigest]),
);

// Register any additional entity layers here to share this server's runner.
export const ClusterLive = CounterEntityLive.pipe(
  Layer.provideMerge(RunnerLive),
);
