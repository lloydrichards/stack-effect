import { Schema } from "effect";
import { ModuleId, TargetIdentity } from "./Catalog";

/**
 * Captures the user's explicit intent: which targets to scaffold and which
 * modules to attach to each target.
 *
 * A Selection is the entry point of the scaffold pipeline. It contains no
 * dependency resolution — that is the responsibility of the Blueprint stage.
 *
 * @category Selection
 * @since 1.0.0
 */
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
