import { describe, expect, it } from "@effect/vitest";
import type { JsonArrayEntryOp, YamlSequenceEntryOp } from "@repo/domain/Plan";
import { Effect } from "effect";
import { JsonComposer } from "./JsonComposer";
import { YamlComposer } from "./YamlComposer";

const jsonEntry = (value: string): typeof JsonArrayEntryOp.Type => ({
  _tag: "json-array-entry",
  fileType: "json",
  field: "workspaces",
  value,
});
const yamlEntry = (value: string): typeof YamlSequenceEntryOp.Type => ({
  _tag: "yaml-sequence-entry",
  fileType: "yaml",
  key: "packages",
  value,
});

const composeJson = (contents: string, values: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const composer = yield* JsonComposer;
    return yield* composer.compose(contents, values.map(jsonEntry));
  }).pipe(Effect.provide(JsonComposer.layer));

const composeYaml = (contents: string, values: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const composer = yield* YamlComposer;
    return yield* composer.compose(contents, values.map(yamlEntry));
  }).pipe(Effect.provide(YamlComposer.layer));

describe("workspace document composition", () => {
  it.effect(
    "appends unique JSON workspace values in order and is byte-idempotent",
    () =>
      Effect.gen(function* () {
        const input =
          '{\n  "name": "root",\n  "workspaces": [\n    "apps/*",\n    "packages/*"\n  ]\n}\n';
        const once = yield* composeJson(input, ["packages/*", "packages/*/*"]);
        const twice = yield* composeJson(once, ["packages/*", "packages/*/*"]);

        expect(JSON.parse(once).workspaces).toEqual([
          "apps/*",
          "packages/*",
          "packages/*/*",
        ]);
        expect(twice).toBe(once);
        expect(once.endsWith("\n")).toBe(true);
      }),
  );

  it.effect(
    "creates a missing JSON workspaces field using established composer semantics",
    () =>
      Effect.gen(function* () {
        const output = yield* composeJson("{}", ["packages/*/*"]);
        expect(output).toBe(
          '{\n  "workspaces": [\n    "packages/*/*"\n  ]\n}\n',
        );
      }),
  );

  it.effect(
    "reports malformed JSON and incompatible fields through ApplyFailure",
    () =>
      Effect.gen(function* () {
        for (const input of ["{", '{"workspaces": {}}']) {
          const failure = yield* Effect.flip(
            composeJson(input, ["packages/*/*"]),
          );
          expect(failure).toMatchObject({
            _tag: "ApplyFailure",
            reason: "repoRootInvalid",
          });
        }
      }),
  );

  it.effect(
    "appends unique YAML package values in order and is byte-idempotent",
    () =>
      Effect.gen(function* () {
        const input = 'packages:\n  - "apps/*"\n  - "packages/*"\n';
        const once = yield* composeYaml(input, ["packages/*", "packages/*/*"]);
        const twice = yield* composeYaml(once, ["packages/*", "packages/*/*"]);

        expect(once).toBe(
          'packages:\n  - "apps/*"\n  - "packages/*"\n  - "packages/*/*"\n',
        );
        expect(twice).toBe(once);
      }),
  );

  it.effect(
    "creates a minimal YAML packages sequence for an empty planned document",
    () =>
      Effect.gen(function* () {
        const output = yield* composeYaml("", ["packages/*/*"]);
        expect(output).toBe('packages:\n  - "packages/*/*"\n');
      }),
  );

  it.effect(
    "reports nonempty missing or malformed YAML package sequences through ApplyFailure",
    () =>
      Effect.gen(function* () {
        for (const input of ["other:\n  - value\n", "packages:\n  value\n"]) {
          const failure = yield* Effect.flip(
            composeYaml(input, ["packages/*/*"]),
          );
          expect(failure).toMatchObject({
            _tag: "ApplyFailure",
            reason: "repoRootInvalid",
          });
        }
      }),
  );
});
