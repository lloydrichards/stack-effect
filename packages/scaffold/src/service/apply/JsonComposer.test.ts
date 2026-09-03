import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";
import { JsonComposer } from "./JsonComposer";

const appendPrepareWithHusky = [
  {
    _tag: "json-pkg-scripts-append" as const,
    fileType: "json" as const,
    entries: [{ name: "prepare", fragment: "husky" }],
  },
];

const appendPrepareLifecycle = [
  {
    _tag: "json-pkg-scripts-append" as const,
    fileType: "json" as const,
    entries: [
      { name: "prepare", fragment: "husky" },
      { name: "prepare", fragment: "lint-staged" },
    ],
  },
];

describe("JsonComposer script appends", () => {
  it.effect("appends a script fragment after an existing prepare command", () =>
    Effect.gen(function* () {
      const composer = yield* JsonComposer;
      const composed = yield* composer.compose(
        JSON.stringify({ scripts: { prepare: "effect-tsgo patch" } }),
        appendPrepareWithHusky,
      );

      expect(JSON.parse(composed)).toMatchObject({
        scripts: { prepare: "effect-tsgo patch && husky" },
      });
    }).pipe(Effect.provide(JsonComposer.layer)),
  );

  it.effect(
    "creates a script from an appended fragment when no base exists",
    () =>
      Effect.gen(function* () {
        const composer = yield* JsonComposer;
        const composed = yield* composer.compose(
          JSON.stringify({ scripts: {} }),
          appendPrepareWithHusky,
        );

        expect(JSON.parse(composed)).toMatchObject({
          scripts: { prepare: "husky" },
        });
      }).pipe(Effect.provide(JsonComposer.layer)),
  );

  it.effect(
    "appends ordered fragments to an arbitrary base without duplicates",
    () =>
      Effect.gen(function* () {
        const composer = yield* JsonComposer;
        const once = yield* composer.compose(
          JSON.stringify({ scripts: { prepare: "custom setup" } }),
          appendPrepareLifecycle,
        );
        const twice = yield* composer.compose(once, appendPrepareLifecycle);

        expect(JSON.parse(twice)).toMatchObject({
          scripts: { prepare: "custom setup && husky && lint-staged" },
        });
      }).pipe(Effect.provide(JsonComposer.layer)),
  );

  it.effect("fails safely when an appended script is not a string", () =>
    Effect.gen(function* () {
      const composer = yield* JsonComposer;
      const exit = yield* Effect.exit(
        composer.compose(
          JSON.stringify({ scripts: { prepare: ["effect-tsgo patch"] } }),
          appendPrepareWithHusky,
        ),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.squash(exit.cause)).toMatchObject({
          _tag: "ApplyFailure",
          message: expect.stringContaining('script "prepare" to be a string'),
        });
      }
    }).pipe(Effect.provide(JsonComposer.layer)),
  );
});
