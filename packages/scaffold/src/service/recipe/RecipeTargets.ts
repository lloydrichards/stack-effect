import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import {
  RecipeTargetSpec,
  type RecipeTargetSpec as RecipeTargetSpecType,
} from "@repo/domain/Recipe";
import { Array as Arr, Effect, pipe, Schema, SchemaGetter } from "effect";

const splitCommaSeparated = (values: ReadonlyArray<string>): Array<string> =>
  Arr.flatMap(values, (value) =>
    pipe(
      value.split(","),
      Arr.map((part) => part.trim()),
      Arr.filter((part) => part.length > 0),
    ),
  );

const duplicatedValues = (values: ReadonlyArray<string>): Array<string> =>
  pipe(
    Arr.groupBy(values, (value) => value),
    Object.entries,
    Arr.filter(([, grouped]) => grouped.length > 1),
    Arr.map(([value]) => value),
  );

const TrimNonEmptyString = Schema.Trim.check(Schema.isNonEmpty());
const TrimTargetName = Schema.Trim.check(
  Schema.isPattern(/^[^:]*$/, {
    message: "Target names cannot contain a colon.",
  }),
);

const RecipeTargetStringPartsWithModules = Schema.TemplateLiteralParser([
  TrimNonEmptyString,
  "/",
  TrimTargetName,
  ":",
  TrimNonEmptyString.check(
    Schema.makeFilter((value) =>
      Arr.isArrayNonEmpty(splitCommaSeparated([value]))
        ? undefined
        : "Expected at least one module ID.",
    ),
  ),
]);

const RecipeTargetStringPartsWithoutModules = Schema.TemplateLiteralParser([
  TrimNonEmptyString,
  "/",
  TrimTargetName,
]);

const RecipeTargetStringParts = Schema.Union([
  RecipeTargetStringPartsWithModules,
  RecipeTargetStringPartsWithoutModules,
]);

const RecipeTargetPartsFromString = Schema.String.pipe(
  Schema.decodeTo(RecipeTargetStringParts),
);

export const RecipeTargetString = RecipeTargetPartsFromString.pipe(
  Schema.decodeTo(RecipeTargetSpec, {
    decode: SchemaGetter.transform((parts) => ({
      target: new TargetIdentity({
        kind: TargetKind.make(parts[0]),
        name: parts[2],
      }),
      modules: parts.length === 5 ? splitCommaSeparated([parts[4]]) : [],
    })),
    encode: SchemaGetter.transform((spec) =>
      spec.modules.length > 0
        ? [
            spec.target.kind,
            "/" as const,
            spec.target.name,
            ":" as const,
            pipe(spec.modules, Arr.map(String), Arr.join(",")),
          ]
        : [spec.target.kind, "/" as const, spec.target.name],
    ),
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
