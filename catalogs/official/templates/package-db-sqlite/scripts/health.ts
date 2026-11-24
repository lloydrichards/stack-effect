{{#if runtime=bun}}import { BunRuntime } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import { NodeRuntime } from "@effect/platform-node";{{/if}}{{#if runtime=deno}}import { DenoRuntime } from "@effect/platform-deno";{{/if}}
import { Console, Effect } from "effect";
import { checkDatabaseHealth } from "../src/HealthCheck";
import { DatabaseLayer } from "../src/Migrations";

const main = Effect.gen(function* () {
  const healthy = yield* checkDatabaseHealth;
  yield* Console.log(healthy ? "Database is healthy" : "Database is unhealthy");
}).pipe(Effect.provide(DatabaseLayer));

{{#if runtime=bun}}BunRuntime{{/if}}{{#if runtime=node}}NodeRuntime{{/if}}{{#if runtime=deno}}DenoRuntime{{/if}}.runMain(main);
