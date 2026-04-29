import { Schema } from "effect";
import { ModuleId, TargetIdentity } from "./Scaffold";

export const Selection = Schema.Struct({
  targets: Schema.Array(
    Schema.Struct({
      identity: TargetIdentity,
      modules: Schema.Array(
        Schema.Struct({
          id: ModuleId,
        }),
      ),
    }),
  ),
});
