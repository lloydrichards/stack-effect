import { ApplyFailure } from "@repo/domain/Apply";
import type { JsonCompositionOperation } from "@repo/domain/Plan";
import { Array as Arr, Effect, Match, Schema } from "effect";

const PackageJson = Schema.Record(Schema.String, Schema.Json);
const PackageJsonFromString = Schema.fromJsonString(PackageJson, { space: 2 });

/** Applies package.json composition operations to the given JSON contents. */
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

    const mutablePkg = { ...pkg } as Record<string, unknown>;

    yield* Effect.forEach(
      operations,
      (op) => applyJsonOperation(mutablePkg, op),
      { discard: true },
    );

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

const applyJsonOperation = (
  pkg: Record<string, unknown>,
  op: JsonCompositionOperation,
): Effect.Effect<void, ApplyFailure, never> =>
  Match.typeTags<JsonCompositionOperation>()({
    "json-workspace-members": (o) =>
      Effect.sync(() => {
        pkg[o.field] = o.members;
      }),
    "json-pkg-exports": (o) =>
      assignPackageJsonEntries(pkg, "exports", o.entries),
    "json-pkg-deps": (o) => assignPackageJsonEntries(pkg, o.section, o.entries),
    "json-pkg-scripts": (o) =>
      assignPackageJsonEntries(pkg, "scripts", o.entries),
  })(op);

const assignPackageJsonEntries = (
  pkg: Record<string, unknown>,
  sectionName: string,
  entries: ReadonlyArray<{ readonly name: string; readonly value: string }>,
): Effect.Effect<void, ApplyFailure, never> =>
  Effect.gen(function* () {
    const existingSection = pkg[sectionName];
    if (existingSection !== undefined && !isPlainObject(existingSection)) {
      return yield* new ApplyFailure({
        message: `Expected package.json field "${sectionName}" to be an object during apply.`,
      });
    }

    pkg[sectionName] = Arr.reduce(
      entries,
      existingSection === undefined ? {} : { ...existingSection },
      (section, entry) => ({
        ...section,
        [entry.name]: entry.value,
      }),
    );
  });

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
