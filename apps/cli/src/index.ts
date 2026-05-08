import { BunServices } from "@effect/platform-bun";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { CatalogService } from "@repo/catalog";
import {
  ApplyService,
  BlueprintService,
  FinalizeService,
  PlanService,
  ScaffoldFormatter,
} from "@repo/scaffold";
import { Config, Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";
import { add } from "./commands/add";
import { graph } from "./commands/graph";
import { init } from "./commands/init";
import { ConfigureService } from "./service/ConfigureService";
import { ScaffoldPipeline } from "./service/ScaffoldPipeline";

const CliConfig = Config.all({
  TARGET: Config.literal("bun", "node").pipe(Config.withDefault("node")),
});

const PlatformLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* CliConfig;
    return config.TARGET === "bun" ? BunServices.layer : NodeServices.layer;
  }),
);

const root = Command.make("stack-effect");

const MainLayer = Layer.mergeAll(
  ApplyService.layer,
  BlueprintService.layer,
  CatalogService.layer,
  FinalizeService.layer,
  PlanService.layer,
  ScaffoldFormatter.layer,
  ConfigureService.layer,
  ScaffoldPipeline.layer,
).pipe(Layer.provideMerge(PlatformLayer));

const program = root.pipe(
  Command.withSubcommands([init, add, graph]),
  Command.run({ version: "1.0.0" }),
  Effect.provide(MainLayer),
);

NodeRuntime.runMain(program);
