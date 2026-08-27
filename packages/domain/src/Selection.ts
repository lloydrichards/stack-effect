import { Schema, SchemaGetter } from "effect";
import {
  ArchitectureId,
  ClassicArchitecture,
  ModuleId,
  TargetIdentity,
} from "./Catalog";

const SelectionTarget = Schema.Struct({
  identity: TargetIdentity,
  modules: Schema.Array(Schema.Struct({ id: ModuleId })),
  architecture: Schema.optional(ArchitectureId),
});

const NormalizedSelectionTarget = SelectionTarget.pipe(
  Schema.decodeTo(Schema.toType(SelectionTarget), {
    decode: SchemaGetter.transform((target) => ({
      ...target,
      architecture:
        target.architecture === ClassicArchitecture
          ? undefined
          : target.architecture,
    })),
    encode: SchemaGetter.transform((target) => ({
      ...target,
      architecture:
        target.architecture === ClassicArchitecture
          ? undefined
          : target.architecture,
    })),
  }),
);

/** User intent only; dependency and physical layout resolution belong to Blueprint. */
export const Selection = Schema.Struct({
  targets: Schema.Array(NormalizedSelectionTarget),
});
