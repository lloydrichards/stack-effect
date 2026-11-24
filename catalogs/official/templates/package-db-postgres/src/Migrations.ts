{{#if runtime=bun}}import { BunServices as PlatformServices } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import { NodeServices as PlatformServices } from "@effect/platform-node";{{/if}}{{#if runtime=deno}}import { DenoServices as PlatformServices } from "@effect/platform-deno";{{/if}}
import { PgMigrator } from "@effect/sql-pg";
import { Effect, Layer, Path } from "effect";
import { PostgresLayer } from "./Database";

const MigrationsDirectory = Effect.gen(function* () {
  const path = yield* Path.Path;
  const modulePath = yield* path.fromFileUrl(new URL(import.meta.url));
  return path.join(path.dirname(modulePath), "migrations");
});

export const MigrationsLayer = Layer.unwrap(
  Effect.map(MigrationsDirectory, (directory) =>
    PgMigrator.layer({
      loader: PgMigrator.fromFileSystem(directory),
    }),
  ),
).pipe(Layer.provide(PlatformServices.layer));

export const MigratedDatabaseLayer = MigrationsLayer.pipe(
  Layer.provide(PostgresLayer),
  Layer.orDie,
);

export const DatabaseLayer = Layer.mergeAll(PostgresLayer, MigratedDatabaseLayer).pipe(
  Layer.satisfiesServicesType<never>(),
);
