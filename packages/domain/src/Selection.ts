import { Schema } from "effect";
import { ModuleId, TargetIdentity } from "./Catalog";

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
