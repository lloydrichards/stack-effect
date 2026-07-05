import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import {
  RecipeTargetSpec,
  type RecipeTargetSpec as RecipeTargetSpecType,
} from "@repo/domain/Recipe";
import { Array as Arr, Effect, pipe, Schema, SchemaGetter } from "effect";
import { duplicatedValues, splitCommaSeparated } from "./utils";

const TrimNonEmptyString = Schema.Trim.check(Schema.isNonEmpty());

const RecipeTargetStringParts = Schema.TemplateLiteralParser([
  TrimNonEmptyString,
  "/",
  Schema.Trim,
  ":",
  TrimNonEmptyString.check(
    Schema.makeFilter((value) =>
      Arr.isArrayNonEmpty(splitCommaSeparated([value]))
        ? undefined
        : "Expected at least one module ID.",
    ),
  ),
]);

const RecipeTargetPartsFromString = Schema.String.pipe(
  Schema.decodeTo(RecipeTargetStringParts),
);

export const RecipeTargetString = RecipeTargetPartsFromString.pipe(
  Schema.decodeTo(RecipeTargetSpec, {
    decode: SchemaGetter.transform(([kind, , name, , moduleText]) => ({
      target: new TargetIdentity({ kind: TargetKind.make(kind), name }),
      modules: splitCommaSeparated([moduleText]),
    })),
    encode: SchemaGetter.transform((spec) => [
      spec.target.kind,
      "/",
      spec.target.name,
      ":",
      pipe(spec.modules, Arr.map(String), Arr.join(",")),
    ]),
  }),
);

const encodeRecipeTargetSpec = Schema.encodeSync(RecipeTargetString);

export const decodeRecipeTargetSpecsEffect = (
  specs: ReadonlyArray<string>,
): Effect.Effect<Array<RecipeTargetSpecType>, Schema.SchemaError> =>
  Effect.forEach(specs, (spec) =>
    Schema.decodeUnknownEffect(RecipeTargetString)(spec),
  );

export const encodeRecipeTargetSpecs = (
  specs: ReadonlyArray<RecipeTargetSpecType>,
): Array<string> =>
  pipe(
    specs,
    Arr.map((spec) => encodeRecipeTargetSpec(spec)),
  );

export const renderRecipeTargetSpec = (spec: RecipeTargetSpecType): string =>
  `${spec.target.kind}/${spec.target.name}:${pipe(
    spec.modules,
    Arr.map(String),
    Arr.join(","),
  )}`;

const recipeTargetSpecToCollected = Effect.fn("recipeTargetSpecToCollected")(
  function* (spec: typeof RecipeTargetSpec.Type) {
    const rawSpec = renderRecipeTargetSpec(spec);

    const duplicateModules = duplicatedValues(spec.modules);
    if (Arr.isArrayNonEmpty(duplicateModules)) {
      return yield* Effect.fail(
        `Duplicate module IDs in target spec "${rawSpec}": ${Arr.join(duplicateModules, ", ")}`,
      );
    }

    return { target: spec.target, modules: spec.modules };
  },
);

export type ParsedRecipeTarget = {
  readonly target: TargetIdentity;
  readonly modules: ReadonlyArray<typeof ModuleId.Type>;
};

export const parseRecipeTargetSpecs = Effect.fn("parseRecipeTargetSpecs")(
  function* (specs: ReadonlyArray<typeof RecipeTargetSpec.Type>) {
    const targets = yield* Effect.forEach(specs, recipeTargetSpecToCollected);
    return mergeRecipeTargets(targets);
  },
);

const mergeRecipeTargets = (
  targets: ReadonlyArray<ParsedRecipeTarget>,
): ReadonlyArray<ParsedRecipeTarget> => {
  const merged = new Map<
    string,
    { target: TargetIdentity; modules: Array<typeof ModuleId.Type> }
  >();

  for (const target of targets) {
    const key = target.target.toKey();
    const existing = merged.get(key);
    merged.set(key, {
      target: target.target,
      modules: Arr.map(
        Arr.dedupe(
          Arr.map([...(existing?.modules ?? []), ...target.modules], String),
        ),
        (moduleId) => ModuleId.make(moduleId),
      ),
    });
  }

  return Arr.fromIterable(merged.values());
};
