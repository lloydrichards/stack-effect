import { ApplyFailure } from "@repo/domain/Apply";
import type { CompositionOperation } from "@repo/domain/Plan";
import { Array as Arr, Context, Effect, Layer, Match, Schema } from "effect";

const PackageJsonFromString = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Unknown),
);

export interface JsonComposerShape {
  readonly compose: (
    contents: string,
    operations: ReadonlyArray<typeof CompositionOperation.cases.json.Type>,
  ) => Effect.Effect<string, ApplyFailure, never>;
}

export class JsonComposer extends Context.Service<
  JsonComposer,
  JsonComposerShape
>()("JsonComposer", {
  make: Effect.succeed({
    compose: (
      contents: string,
      operations: ReadonlyArray<typeof CompositionOperation.cases.json.Type>,
    ) =>
      Effect.gen(function* () {
        const pkg = yield* Schema.decodeUnknownEffect(PackageJsonFromString)(
          contents,
        ).pipe(
          Effect.mapError(
            (error) =>
              new ApplyFailure({
                reason: "repoRootInvalid",
                message: `Could not parse package.json during apply: ${error.message}`,
              }),
          ),
        );

        const mutablePkg = { ...pkg } as Record<string, unknown>;

        yield* Effect.forEach(
          operations,
          (op) => applyJsonOperation(mutablePkg, op),
          { discard: true },
        );

        return yield* Schema.encodeUnknownEffect(PackageJsonFromString)(
          mutablePkg,
        ).pipe(
          Effect.mapError(
            (error) =>
              new ApplyFailure({
                reason: "repoRootInvalid",
                message: `Could not encode package.json during apply: ${error.message}`,
              }),
          ),
        );
      }),
  } satisfies JsonComposerShape),
}) {
  static readonly layer = Layer.effect(JsonComposer)(JsonComposer.make).pipe(
    Layer.satisfiesServicesType<never>(),
  );
}

const applyJsonOperation = (
  pkg: Record<string, unknown>,
  op: typeof CompositionOperation.cases.json.Type,
): Effect.Effect<void, ApplyFailure, never> =>
  Match.typeTags<typeof CompositionOperation.cases.json.Type>()({
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
        reason: "repoRootInvalid",
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
