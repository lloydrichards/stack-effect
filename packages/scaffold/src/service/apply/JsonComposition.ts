import { ApplyFailure } from "@repo/domain/Apply";
import type { JsonCompositionOperation } from "@repo/domain/Plan";
import { Effect, Match, Schema } from "effect";

const PackageJson = Schema.Record(Schema.String, Schema.Json);
const PackageJsonFromString = Schema.fromJsonString(PackageJson, { space: 2 });

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assignPackageJsonEntries = Effect.fnUntraced(function* (
  pkg: Record<string, unknown>,
  sectionName: string,
  entries: ReadonlyArray<{ readonly name: string; readonly value: string }>,
) {
  const existingSection = pkg[sectionName];
  if (existingSection !== undefined && !isPlainObject(existingSection)) {
    return yield* new ApplyFailure({
      message: `Expected package.json field "${sectionName}" to be an object during apply.`,
    });
  }

  const section: Record<string, unknown> = { ...existingSection };
  for (const entry of entries) {
    section[entry.name] = entry.value;
  }
  pkg[sectionName] = section;
});

const applyJsonOperation = (
  pkg: Record<string, unknown>,
  op: JsonCompositionOperation,
): Effect.Effect<void, ApplyFailure> =>
  Match.valueTags(op, {
    "json-workspace-members": (o) => {
      pkg[o.field] = o.members;
      return Effect.void;
    },
    "json-pkg-exports": (o) =>
      assignPackageJsonEntries(pkg, "exports", o.entries),
    "json-pkg-deps": (o) => assignPackageJsonEntries(pkg, o.section, o.entries),
    "json-pkg-scripts": (o) =>
      assignPackageJsonEntries(pkg, "scripts", o.entries),
  });

export const composeJson: (
  contents: string,
  operations: ReadonlyArray<JsonCompositionOperation>,
) => Effect.Effect<string, ApplyFailure> = Effect.fnUntraced(
  function* (contents, operations) {
    const pkg = yield* Schema.decodeEffect(PackageJsonFromString)(
      contents,
    ).pipe(
      Effect.mapError(
        (error) =>
          new ApplyFailure({
            message: `Could not parse package.json during apply: ${error.message}`,
            cause: error,
          }),
      ),
    );

    const mutablePkg: Record<string, unknown> = { ...pkg };
    for (const op of operations) {
      yield* applyJsonOperation(mutablePkg, op);
    }

    const encoded = yield* Schema.encodeUnknownEffect(PackageJsonFromString)(
      mutablePkg,
    ).pipe(
      Effect.mapError(
        (error) =>
          new ApplyFailure({
            message: `Could not encode package.json during apply: ${error.message}`,
            cause: error,
          }),
      ),
    );

    return `${encoded}\n`;
  },
);
