{{#if runtime=bun}}import { BunRuntime } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import { NodeRuntime } from "@effect/platform-node";{{/if}}{{#if runtime=deno}}import { DenoRuntime } from "@effect/platform-deno";{{/if}}
import { Console, Effect } from "effect";
import { checkDatabaseHealth, DatabaseLive } from "../src";

const program = Effect.gen(function* () {
  const healthy = yield* checkDatabaseHealth;
  yield* Console.log(healthy ? "Database is healthy" : "Database is unhealthy");
}).pipe(Effect.provide(DatabaseLive));

{{#if runtime=bun}}BunRuntime{{/if}}{{#if runtime=node}}NodeRuntime{{/if}}{{#if runtime=deno}}DenoRuntime{{/if}}.runMain(program);
