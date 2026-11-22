// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Cluster.
import { SqliteClient } from "{{#if runtime=bun}}@effect/sql-sqlite-bun{{/if}}{{#if runtime=node}}@effect/sql-sqlite-node{{/if}}{{#if runtime=deno}}@effect/sql-sqlite-node{{/if}}";
import { Layer } from "effect";
import { SingleRunner } from "effect/cluster";
import { Digest } from "effect/crypto";
import { CounterEntityLive } from "./Counter";

const RunnerLive = SingleRunner.layer({ runnerStorage: "memory" }).pipe(
  Layer.provide([SqliteClient.layer({ filename: ":memory:" }), Digest.layerWebCrypto]),
);

// Register any additional entity layers here to share this server's runner.
export const ClusterLive = CounterEntityLive.pipe(
  Layer.provideMerge(RunnerLive),
);
