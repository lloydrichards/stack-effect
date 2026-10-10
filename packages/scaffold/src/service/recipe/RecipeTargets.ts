import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import {
  RecipeTargetSpec,
  type RecipeTargetSpec as RecipeTargetSpecType,
} from "@repo/domain/Recipe";
import {
  Array as Arr,
  Effect,
  pipe,
  Result,
  Schema,
  SchemaGetter,
} from "effect";

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

const targetParts = (value: string) => {
  const slash = value.indexOf("/");
  const colon = value.indexOf(":", slash + 1);
  return {
    kind: value.slice(0, slash).trim(),
    name: value.slice(slash + 1, colon < 0 ? undefined : colon).trim(),
    modules: colon < 0 ? [] : splitCommaSeparated([value.slice(colon + 1)]),
    hasModules: colon >= 0,
  };
};

export const RecipeTargetString = Schema.String.check(
  Schema.makeFilter((value) => {
    const parts = targetParts(value);
    return (
      (value.includes("/") &&
        Result.isSuccess(
          Schema.decodeResult(TargetIdentity)({
            kind: parts.kind,
            name: parts.name,
          }),
        ) &&
        (!parts.hasModules || parts.modules.length > 0) &&
        !parts.name.includes(":")) ||
      "Expected kind/name[:module-id,...] with a valid target name"
    );
  }),
).pipe(
  Schema.decodeTo(RecipeTargetSpec, {
    decode: SchemaGetter.transform((value) => {
      const parts = targetParts(value);
      return {
        target: new TargetIdentity({
          kind: TargetKind.make(parts.kind),
          name: parts.name,
        }),
        modules: parts.modules,
      };
    }),
    encode: SchemaGetter.transform(
      (spec) =>
        `${spec.target.kind}/${spec.target.name}${spec.modules.length > 0 ? `:${spec.modules.join(",")}` : ""}`,
    ),
  }),
);

const encodeRecipeTargetSpec = Schema.encodeSync(RecipeTargetString);

export const decodeRecipeTargetSpecsEffect = (
  specs: ReadonlyArray<string>,
): Effect.Effect<Array<RecipeTargetSpecType>, Schema.SchemaError> =>
  Effect.forEach(specs, (spec) =>
    Schema.decodeEffect(RecipeTargetString)(spec),
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
