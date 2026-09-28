{{#if runtime=bun}}import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { SqliteMigrator } from "@effect/sql-sqlite-bun";{{/if}}{{#if runtime=node}}import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { SqliteMigrator } from "@effect/sql-sqlite-node";{{/if}}{{#if runtime=deno}}import { DenoFileSystem, DenoPath } from "@effect/platform-deno";
import { SqliteMigrator } from "@effect/sql-sqlite-node";{{/if}}
import { Effect, Layer, Path } from "effect";
import { SqliteLive } from "./Database";

const MigrationsDirectory = Effect.gen(function* () {
  const path = yield* Path.Path;
  return path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "migrations",
  );
});

export const MigrationsLive = Layer.unwrap(
  Effect.map(MigrationsDirectory, (directory) =>
    SqliteMigrator.layer({
      loader: SqliteMigrator.fromFileSystem(directory),
    }),
  ),
).pipe(Layer.provide({{#if runtime=bun}}[BunFileSystem.layer, BunPath.layer]{{/if}}{{#if runtime=node}}[NodeFileSystem.layer, NodePath.layer]{{/if}}{{#if runtime=deno}}[DenoFileSystem.layer, DenoPath.layer]{{/if}}));

export const MigratedLive = MigrationsLive.pipe(
  Layer.provide(SqliteLive),
  Layer.orDie,
);

export const DatabaseLive = Layer.mergeAll(SqliteLive, MigratedLive);
