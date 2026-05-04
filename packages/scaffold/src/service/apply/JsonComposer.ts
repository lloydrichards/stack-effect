import type {
  CompositionOperation,
  JsonPkgDepsOp,
  JsonPkgExportsOp,
  JsonPkgScriptsOp,
} from "@repo/domain/Plan";
import { Context, Effect, Layer, Match, Schema } from "effect";

// =============================================================================
// Schemas
// =============================================================================

const PackageJsonFromString = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Unknown),
);

// =============================================================================
// Service Definition
// =============================================================================

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
            Effect.gen(function* () {
              Match.typeTags<typeof CompositionOperation.cases.json.Type>()({
                "json-pkg-exports": (o) => {
                  const exports = (mutablePkg["exports"] ?? {}) as Record<
                    string,
                    string
                  >;
                  for (const entry of o.entries) {
                    exports[entry.name] = entry.value;
                  }
                  mutablePkg["exports"] = exports;
                },
                "json-pkg-deps": (o) => {
                  const section = (mutablePkg[o.section] ?? {}) as Record<
                    string,
                    string
                  >;
                  for (const entry of o.entries) {
                    section[entry.name] = entry.value;
                  }
                  mutablePkg[o.section] = section;
                },
                "json-pkg-scripts": (o) => {
                  const scripts = (mutablePkg["scripts"] ?? {}) as Record<
                    string,
                    string
                  >;
                  for (const entry of o.entries) {
                    scripts[entry.name] = entry.value;
                  }
                  mutablePkg["scripts"] = scripts;
                },
              })(op);
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
