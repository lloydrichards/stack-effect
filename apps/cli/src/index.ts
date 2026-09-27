import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { cliProgram } from "./cliProgram";
import { StackEffectLayer } from "./runtime";

NodeRuntime.runMain(cliProgram.pipe(Effect.provide(StackEffectLayer)), {
  disableErrorReporting: true,
});
