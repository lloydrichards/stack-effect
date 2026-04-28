import { BunRuntime, BunServices } from "@effect/platform-bun";
import {
  ApplyService,
  BlueprintService,
  PlanService,
  ScaffoldFormatter,
} from "@repo/scaffold";
import { Console, Effect, Layer } from "effect";

import { Command, Flag, Prompt } from "effect/unstable/cli";

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------
const formatFlag = Flag.choice("format", ["json"]).pipe(
  Flag.optional,
  Flag.withDescription("Output results as JSON"),
);

const rootDirFlag = Flag.directory("rootDir").pipe(
  Flag.optional,
  Flag.withDescription(
    "Root directory of the repository to scaffold (defaults to current working directory)",
  ),
  Flag.withAlias("r"),
);

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------
const root = Command.make("stack-effect");

const init = Command.make(
  "init",
  {
    rootDir: rootDirFlag,
    format: formatFlag,
  },
  ({ format, rootDir }) =>
    Effect.gen(function* () {
      const confirm = yield* Prompt.confirm({
        message: "Proceed with scaffolding?",
        initial: true,
      });

      yield* Console.log(`Format: ${format}`);
      yield* Console.log(`Root directory: ${rootDir}`);

      if (confirm) {
        yield* Console.log("Scaffolding...");
      }
    }),
);

const add = Command.make(
  "add",
  {
    rootDir: rootDirFlag,
    format: formatFlag,
  },
  ({ format, rootDir }) =>
    Effect.gen(function* () {
      const confirm = yield* Prompt.confirm({
        message: "Proceed with scaffolding?",
        initial: true,
      });

      yield* Console.log(`Format: ${format}`);
      yield* Console.log(`Root directory: ${rootDir}`);

      if (confirm) {
        yield* Console.log("Scaffolding...");
      }
    }),
);

const MainLayer = Layer.mergeAll(
  ApplyService.layer,
  BlueprintService.layer,
  PlanService.layer,
  ScaffoldFormatter.layer,
).pipe(Layer.provideMerge(BunServices.layer));

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const program = root.pipe(
  Command.withSubcommands([init, add]),
  Command.run({ version: "1.0.0" }),
  Effect.provide(MainLayer),
);

BunRuntime.runMain(program);
