import { describe, expect, it } from "@effect/vitest";
import type { YamlSequenceEntryOp } from "@repo/domain/Plan";
import { Effect } from "effect";
import { YamlComposer } from "./YamlComposer";

const yamlEntry = (value: string): typeof YamlSequenceEntryOp.Type => ({
  _tag: "yaml-sequence-entry",
  fileType: "yaml",
  key: "packages",
  value,
});

const compose = (contents: string, values = ["packages/*/*"]) =>
  Effect.gen(function* () {
    const composer = yield* YamlComposer;
    return yield* composer.compose(contents, values.map(yamlEntry));
  }).pipe(Effect.provide(YamlComposer.layer));

describe("YamlComposer", () => {
  it.effect(
    "splices only the top-level packages sequence without rewriting bytes",
    () =>
      Effect.gen(function* () {
        const input =
          '# workspace\npackages:\n  - "apps/*" # keep\n  - "packages/*"\n\nallowBuilds:\n  esbuild: true\n';
        const expected =
          '# workspace\npackages:\n  - "apps/*" # keep\n  - "packages/*"\n  - "packages/*/*"\n\nallowBuilds:\n  esbuild: true\n';

        const once = yield* compose(input);
        const twice = yield* compose(once);

        expect(once).toBe(expected);
        expect(twice).toBe(once);
      }),
  );

  it.effect("retains order and uses the document newline convention", () =>
    Effect.gen(function* () {
      const input =
        'packages:\r\n  - "apps/*"\r\n  - "packages/*"\r\n\r\nallowBuilds:\r\n  esbuild: true\r\n';
      const output = yield* compose(input, ["packages/*", "packages/*/*"]);

      expect(output).toBe(
        'packages:\r\n  - "apps/*"\r\n  - "packages/*"\r\n  - "packages/*/*"\r\n\r\nallowBuilds:\r\n  esbuild: true\r\n',
      );
    }),
  );

  it.effect("creates a minimal packages sequence for an absent file", () =>
    Effect.gen(function* () {
      const once = yield* compose("");
      const twice = yield* compose(once);

      expect(once).toBe('packages:\n  - "packages/*/*"\n');
      expect(twice).toBe(once);
    }),
  );

  it.effect("does not match nested packages keys", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        compose('catalog:\n  packages:\n    - "apps/*"\n'),
      );
      expect(failure).toMatchObject({
        _tag: "ApplyFailure",
        reason: "repoRootInvalid",
      });
    }),
  );

  it.effect(
    "returns ApplyFailure for missing, malformed, or non-sequence packages",
    () =>
      Effect.gen(function* () {
        for (const input of [
          "other:\n  - value\n",
          "packages: []\n",
          "packages:\n  value\n",
        ]) {
          const failure = yield* Effect.flip(compose(input));
          expect(failure).toMatchObject({
            _tag: "ApplyFailure",
            reason: "repoRootInvalid",
          });
        }
      }),
  );
});
