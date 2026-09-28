{{#if runtime=bun}}import { BunServices as PlatformServices } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import { NodeServices as PlatformServices } from "@effect/platform-node";{{/if}}{{#if runtime=deno}}import { DenoServices as PlatformServices } from "@effect/platform-deno";{{/if}}
import { PgClient } from "@effect/sql-pg";
import { Config, Layer, Redacted, String } from "effect";

export const DatabaseConfig = Config.all({
  url: Config.Redacted("DATABASE_URL").pipe(
    Config.withDefault(
      Redacted.make(
        "postgres://stack_effect:stack_effect@localhost:5432/stack_effect",
      ),
    ),
  ),
  maxConnections: Config.Int("DATABASE_MAX_CONNECTIONS").pipe(
    Config.withDefault(10),
  ),
});

export const PostgresLive = PgClient.layerConfig({
  url: DatabaseConfig.pipe(Config.map((config) => config.url)),
  maxConnections: DatabaseConfig.pipe(
    Config.map((config) => config.maxConnections),
  ),
  transformQueryNames: Config.succeed(String.camelToSnake),
  transformResultNames: Config.succeed(String.snakeToCamel),
}).pipe(
  Layer.provide(PlatformServices.layer),
  Layer.satisfiesServicesType<never>(),
);
