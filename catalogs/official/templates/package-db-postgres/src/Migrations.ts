{{#if runtime=bun}}import { BunServices as PlatformServices } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import { NodeServices as PlatformServices } from "@effect/platform-node";{{/if}}{{#if runtime=deno}}import { DenoServices as PlatformServices } from "@effect/platform-deno";{{/if}}
import { PgMigrator } from "@effect/sql-pg";
import { Effect, Layer, Path } from "effect";
import { PostgresLive } from "./Database";

const MigrationsDirectory = Effect.gen(function* () {
  const path = yield* Path.Path;
  return path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "migrations",
  );
});

export const MigrationsLive = Layer.unwrap(
  Effect.map(MigrationsDirectory, (directory) =>
    PgMigrator.layer({
      loader: PgMigrator.fromFileSystem(directory),
    }),
  ),
).pipe(Layer.provide(PlatformServices.layer));

export const MigratedLive = MigrationsLive.pipe(
  Layer.provide(PostgresLive),
  Layer.orDie,
);

export const DatabaseLive = Layer.mergeAll(PostgresLive, MigratedLive).pipe(
  Layer.satisfiesServicesType<never>(),
);
