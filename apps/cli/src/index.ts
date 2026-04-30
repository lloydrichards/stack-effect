import { BunRuntime, BunServices } from "@effect/platform-bun";
import { CatalogService } from "@repo/catalog";
import {
  ApplyService,
  BlueprintService,
  PlanService,
  ScaffoldFormatter,
} from "@repo/scaffold";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";
import { add } from "./commands/add";
import { graph } from "./commands/graph";
import { init } from "./commands/init";
import { ConfigureService } from "./service/ConfigureService";
import { ScaffoldPipeline } from "./service/ScaffoldPipeline";

const root = Command.make("stack-effect");

const MainLayer = Layer.mergeAll(
  ApplyService.layer,
  BlueprintService.layer,
  CatalogService.layer,
  PlanService.layer,
  ScaffoldFormatter.layer,
  ConfigureService.layer,
  ScaffoldPipeline.layer,
).pipe(Layer.provideMerge(BunServices.layer));

const program = root.pipe(
  Command.withSubcommands([init, add, graph]),
  Command.run({ version: "1.0.0" }),
  Effect.provide(MainLayer),
);

BunRuntime.runMain(program);
