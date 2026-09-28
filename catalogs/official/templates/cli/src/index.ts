{{#if runtime=bun}}import { BunRuntime, BunServices } from "@effect/platform-bun";{{/if}}{{#if runtime=deno}}import { DenoRuntime, DenoServices } from "@effect/platform-deno";{{/if}}{{#if runtime=node}}import { NodeRuntime, NodeServices } from "@effect/platform-node";{{/if}}
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";

const root = Command.make("{{packageName}}");

// NOTE: Modules inject additional subcommands through Command.withSubcommands.
const AllCommands = Command.withSubcommands([]);

// NOTE: Modules append additional runtime layers through Layer.mergeAll.
const RuntimeLayers = Layer.mergeAll({{#if runtime=bun}}BunServices{{/if}}{{#if runtime=node}}NodeServices{{/if}}{{#if runtime=deno}}DenoServices{{/if}}.layer);

root.pipe(
  AllCommands,
  Command.run({ version: "0.0.0" }),
  Effect.provide(RuntimeLayers),
  {{#if runtime=bun}}BunRuntime{{/if}}{{#if runtime=node}}NodeRuntime{{/if}}{{#if runtime=deno}}DenoRuntime{{/if}}.runMain,
);
