import { Schema, SchemaGetter } from "effect";
import {
  ArchitectureId,
  ClassicArchitecture,
  ModuleId,
  TargetIdentity,
} from "./Catalog";

const RecipeTargetFields = Schema.Struct({
  target: TargetIdentity,
  modules: Schema.Array(ModuleId),
  architecture: Schema.optional(ArchitectureId),
});

/** A target-level architecture intent; omission and explicit Classic normalize identically. */
export const RecipeTargetSpec = RecipeTargetFields.pipe(
  Schema.decodeTo(Schema.toType(RecipeTargetFields), {
    decode: SchemaGetter.transform((spec) => ({
      target: spec.target,
      modules: spec.modules,
      ...(spec.architecture === undefined ||
      spec.architecture === ClassicArchitecture
        ? {}
        : { architecture: spec.architecture }),
    })),
    encode: SchemaGetter.transform((spec) => ({
      target: spec.target,
      modules: spec.modules,
      ...(spec.architecture === undefined ||
      spec.architecture === ClassicArchitecture
        ? {}
        : { architecture: spec.architecture }),
    })),
  }),
);

export type RecipeTargetSpec = typeof RecipeTargetSpec.Type;

export const RecipeSpec = Schema.Struct({
  targets: Schema.Array(RecipeTargetSpec),
});

export type RecipeSpec = typeof RecipeSpec.Type;
