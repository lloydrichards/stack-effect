import { Schema } from "effect";
import { GenerationDomainSelection, ModuleId, TargetIdentity } from "./Catalog";

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
  domains: Schema.optional(Schema.Array(GenerationDomainSelection)),
}).check(
  Schema.makeFilter((selection) => {
    const ids = (selection.domains ?? []).map((domain) => domain.id);
    return new Set(ids).size === ids.length
      ? []
      : ["Generation domain selections must be unique by id"];
  }),
);
