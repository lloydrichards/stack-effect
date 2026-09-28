{{#if runtime=bun}}import { BunRuntime } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import { NodeRuntime } from "@effect/platform-node";{{/if}}{{#if runtime=deno}}import { DenoRuntime } from "@effect/platform-deno";{{/if}}
import { Console, Effect } from "effect";
import { MigratedLive } from "../src";

const program = Console.log("Database migrations completed").pipe(
  Effect.provide(MigratedLive),
);

{{#if runtime=bun}}BunRuntime{{/if}}{{#if runtime=node}}NodeRuntime{{/if}}{{#if runtime=deno}}DenoRuntime{{/if}}.runMain(program);
