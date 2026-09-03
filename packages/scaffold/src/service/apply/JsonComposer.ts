import { ApplyFailure } from "@repo/domain/Apply";
import type { JsonCompositionOperation } from "@repo/domain/Plan";
import { Array as Arr, Context, Effect, Layer, Match, Schema } from "effect";

const PackageJson = Schema.Record(Schema.String, Schema.Unknown);
const PackageJsonFromString = Schema.fromJsonString(PackageJson);

export interface JsonComposerShape {
  readonly compose: (
    contents: string,
    operations: ReadonlyArray<JsonCompositionOperation>,
  ) => Effect.Effect<string, ApplyFailure, never>;
}

export class JsonComposer extends Context.Service<
  JsonComposer,
  JsonComposerShape
>()("JsonComposer", {
  make: Effect.succeed({
    compose: (
      contents: string,
      operations: ReadonlyArray<JsonCompositionOperation>,
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

        const encoded = yield* Schema.encodeUnknownEffect(PackageJson)(
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

        return `${JSON.stringify(encoded, null, 2)}\n`;
      }),
  } satisfies JsonComposerShape),
}) {
  static readonly layer = Layer.effect(JsonComposer)(JsonComposer.make).pipe(
    Layer.satisfiesServicesType<never>(),
  );
}

const applyJsonOperation = (
  pkg: Record<string, unknown>,
  op: JsonCompositionOperation,
): Effect.Effect<void, ApplyFailure, never> =>
  Match.typeTags<JsonCompositionOperation>()({
    "json-pkg-exports": (o) =>
      assignPackageJsonEntries(pkg, "exports", o.entries),
    "json-pkg-deps": (o) => assignPackageJsonEntries(pkg, o.section, o.entries),
    "json-pkg-scripts": (o) =>
      assignPackageJsonEntries(pkg, "scripts", o.entries),
    "json-pkg-scripts-append": (o) =>
      appendPackageJsonScriptEntries(pkg, o.entries),
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

const appendPackageJsonScriptEntries = (
  pkg: Record<string, unknown>,
  entries: ReadonlyArray<{ readonly name: string; readonly fragment: string }>,
): Effect.Effect<void, ApplyFailure, never> =>
  Effect.gen(function* () {
    const existingScripts = pkg["scripts"];
    if (existingScripts !== undefined && !isPlainObject(existingScripts)) {
      return yield* new ApplyFailure({
        reason: "repoRootInvalid",
        message:
          'Expected package.json field "scripts" to be an object during apply.',
      });
    }

    const scripts = { ...(existingScripts ?? {}) };
    yield* Effect.forEach(
      entries,
      ({ name, fragment }) => {
        const existing = scripts[name];
        if (existing !== undefined && typeof existing !== "string") {
          return Effect.fail(
            new ApplyFailure({
              reason: "repoRootInvalid",
              message: `Expected package.json script "${name}" to be a string during apply.`,
            }),
          );
        }

        scripts[name] =
          typeof existing === "string" &&
          existing.split(" && ").includes(fragment)
            ? existing
            : existing === undefined
              ? fragment
              : `${existing} && ${fragment}`;
        return Effect.void;
      },
      { discard: true },
    );
    pkg["scripts"] = scripts;
  });

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
