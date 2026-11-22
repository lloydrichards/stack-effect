// @effect-diagnostics unstableApiUsage:off This Labs example demonstrates Effect Cluster.
{{#if runtime=bun}}import { BunFileSystem, BunPath } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import { NodeFileSystem, NodePath } from "@effect/platform-node";{{/if}}{{#if runtime=deno}}import { DenoFileSystem, DenoPath } from "@effect/platform-deno";{{/if}}
import { SqliteClient } from "{{#if runtime=bun}}@effect/sql-sqlite-bun{{/if}}{{#if runtime=node}}@effect/sql-sqlite-node{{/if}}{{#if runtime=deno}}@effect/sql-sqlite-node{{/if}}";
import { Config, Effect, FileSystem, Layer, Path } from "effect";
import { SingleRunner } from "effect/cluster";
import { Digest } from "effect/crypto";
import { CounterEntityLive } from "./Counter";

const counterClusterConfig = Config.all({
  filename: Config.String("CLUSTER_DATABASE_FILE").pipe(
    Config.withDefault(".cache/cluster-counter.sqlite"),
  ),
});

const ClusterSqliteLive = Layer.unwrap(
  Effect.gen(function* () {
    const { filename } = yield* counterClusterConfig;

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    yield* fs.makeDirectory(path.dirname(filename), { recursive: true });

    return SqliteClient.layer({ filename });
  }),
).pipe(Layer.provide([{{#if runtime=bun}}BunFileSystem.layer, BunPath.layer{{/if}}{{#if runtime=node}}NodeFileSystem.layer, NodePath.layer{{/if}}{{#if runtime=deno}}DenoFileSystem.layer, DenoPath.layer{{/if}}]));

const RunnerLive = SingleRunner.layer().pipe(
  Layer.provide([ClusterSqliteLive, Digest.layerWebCrypto]),
);

// Register additional entity layers here to share this server's runner.
export const ClusterLive = CounterEntityLive.pipe(
  Layer.provideMerge(RunnerLive),
);
