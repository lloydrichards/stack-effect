{{#if runtime=bun}}import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { SqliteMigrator } from "@effect/sql-sqlite-bun";{{/if}}{{#if runtime=node}}import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { SqliteMigrator } from "@effect/sql-sqlite-node";{{/if}}{{#if runtime=deno}}import { DenoFileSystem, DenoPath } from "@effect/platform-deno";
import { SqliteMigrator } from "@effect/sql-sqlite-node";{{/if}}
import { Config, Effect, Layer } from "effect";
import { SqliteLive } from "./Database";
import { makeMigrationsDirectoryConfig } from "./RuntimePaths";

export const MigrationsDirectoryConfig: Config.Config<string> = makeMigrationsDirectoryConfig(
  new URL(import.meta.url),
  "{{targetPath}}/src/migrations",
  Layer.mergeAll({{#if runtime=bun}}BunFileSystem.layer, BunPath.layer{{/if}}{{#if runtime=node}}NodeFileSystem.layer, NodePath.layer{{/if}}{{#if runtime=deno}}DenoFileSystem.layer, DenoPath.layer{{/if}}),
);

export const MigrationsLive = Layer.unwrap(
  Effect.gen(function* () {
    const directory = yield* MigrationsDirectoryConfig;
    return SqliteMigrator.layer({
      loader: SqliteMigrator.fromFileSystem(directory),
    });
  }),
).pipe(Layer.provide({{#if runtime=bun}}[BunFileSystem.layer, BunPath.layer]{{/if}}{{#if runtime=node}}[NodeFileSystem.layer, NodePath.layer]{{/if}}{{#if runtime=deno}}[DenoFileSystem.layer, DenoPath.layer]{{/if}}));

export const MigratedLive = MigrationsLive.pipe(
  Layer.provide(SqliteLive),
  Layer.orDie,
);

export const DatabaseLive = Layer.mergeAll(SqliteLive, MigratedLive);
