import type { CompositionOperation } from "@repo/domain/Plan";
import { Context, Effect, Layer, Match, Schema } from "effect";

const PackageJsonFromString = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Unknown),
);

export class JsonComposer extends Context.Service<JsonComposer>()(
  "JsonComposer",
  {
    make: Effect.succeed({
      compose: (
        contents: string,
        operations: ReadonlyArray<typeof CompositionOperation.cases.json.Type>,
      ) =>
        Effect.gen(function* () {
          const pkg = yield* Schema.decodeUnknownEffect(PackageJsonFromString)(
            contents,
          );

          const mutablePkg = { ...pkg } as Record<string, unknown>;

          yield* Effect.forEach(operations, (op) =>
            Effect.sync(() => {
              applyJsonOperation(mutablePkg, op);
            }),
          );

          return yield* Schema.encodeUnknownEffect(PackageJsonFromString)(
            mutablePkg,
          );
        }),
    }),
  },
) {
  static readonly layer = Layer.effect(JsonComposer)(JsonComposer.make);
}

const applyJsonOperation = (
  pkg: Record<string, unknown>,
  op: typeof CompositionOperation.cases.json.Type,
): void =>
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
): void => {
  const section = (pkg[sectionName] ?? {}) as Record<string, string>;
  for (const entry of entries) {
    section[entry.name] = entry.value;
  }
  pkg[sectionName] = section;
};
