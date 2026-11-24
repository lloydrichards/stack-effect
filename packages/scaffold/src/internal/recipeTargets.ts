import {
  type ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  RecipeTargetSpec,
  type RecipeTargetSpec as RecipeTargetSpecType,
} from "@repo/domain/Recipe";
import { Array as Arr, Effect, Result, Schema, SchemaGetter } from "effect";

const splitCommaSeparated = (values: ReadonlyArray<string>): Array<string> =>
  values.flatMap((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );

const duplicatedValues = (values: ReadonlyArray<string>): Array<string> =>
  Object.entries(Arr.groupBy(values, (value) => value))
    .filter(([, grouped]) => grouped.length > 1)
    .map(([value]) => value);

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

/** @internal */
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

/** @internal */
export type RecipeTargetString = typeof RecipeTargetString.Type;

const encodeRecipeTargetSpec = Schema.encodeSync(RecipeTargetString);

/** @internal */
export const encodeRecipeTargetSpecs = (
  specs: ReadonlyArray<RecipeTargetSpecType>,
): Array<string> => specs.map((spec) => encodeRecipeTargetSpec(spec));

const renderRecipeTargetSpec = (spec: RecipeTargetSpecType): string =>
  `${spec.target.kind}/${spec.target.name}:${spec.modules.join(",")}`;

/** @internal */
export type ParsedRecipeTarget = {
  readonly target: TargetIdentity;
  readonly modules: ReadonlyArray<ModuleId>;
};

/** @internal */
export const mergeRecipeTargets = (
  targets: ReadonlyArray<ParsedRecipeTarget>,
): Array<ParsedRecipeTarget> => {
  const merged = new Map<
    string,
    { target: TargetIdentity; readonly modules: Set<ModuleId> }
  >();

  for (const { target, modules } of targets) {
    const existing = merged.get(target.toKey());
    if (existing === undefined) {
      merged.set(target.toKey(), { target, modules: new Set(modules) });
      continue;
    }
    existing.target = target;
    for (const moduleId of modules) existing.modules.add(moduleId);
  }

  return [...merged.values()].map(({ target, modules }) => ({
    target,
    modules: [...modules],
  }));
};

const recipeTargetSpecToCollected = Effect.fnUntraced(function* (
  spec: RecipeTargetSpec,
) {
  const duplicateModules = duplicatedValues(spec.modules);

  if (duplicateModules.length > 0) {
    return yield* Effect.fail(
      `Duplicate module IDs in target spec "${renderRecipeTargetSpec(spec)}": ${duplicateModules.join(", ")}`,
    );
  }

  return { target: spec.target, modules: spec.modules };
});

/** @internal */
export const parseRecipeTargetSpecs: (
  specs: ReadonlyArray<RecipeTargetSpec>,
) => Effect.Effect<Array<ParsedRecipeTarget>, string> = Effect.fnUntraced(
  function* (specs: ReadonlyArray<RecipeTargetSpec>) {
    const targets = yield* Effect.forEach(specs, recipeTargetSpecToCollected);
    return mergeRecipeTargets(targets);
  },
);
