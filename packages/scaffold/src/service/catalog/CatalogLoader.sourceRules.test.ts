import { assert, describe, it } from "@effect/vitest";
import { ModuleId } from "@repo/domain/Catalog";
import { Effect } from "effect";
import { CatalogCompositionFailure } from "./CatalogLoader";
import {
  json,
  loadSources,
  module,
  officialUrl,
  routedLayer,
  select,
  target,
  urls,
} from "./testSources";

/** Contributes to the official server target and declares that dependency. */
const ext = json("ext", {
  requires: ["official"],
  modules: [module("ext-auth", "server")],
});

describe("loadSources source rules", () => {
  it.effect(
    "should fail with missing-source and suggest --catalog official when a required official source is not selected",
    () => {
      const { layer } = routedLayer({ [urls.ext]: () => ext });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(loadSources(select("ext")));
        assert.instanceOf(error, CatalogCompositionFailure);
        assert.deepStrictEqual(
          error.issues.map((issue) => issue.code),
          ["missing-source"],
        );
        assert.match(
          error.message,
          /Source ext requires the official catalog, which is not selected/,
        );
        assert.match(error.message, /--catalog official/);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect(
    "should attribute each copy's issues to its own source when two sources define the same module",
    () => {
      const { layer } = routedLayer({
        [urls.acme]: () =>
          json("acme", {
            targets: [target("api")],
            modules: [module("shared", "api")],
          }),
        [urls.beta]: () =>
          json("beta", {
            targets: [target("worker")],
            modules: [
              module("shared", "worker", {
                conflictsWith: [ModuleId.make("beta-missing")],
              }),
            ],
          }),
      });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(loadSources(select("acme", "beta")));
        assert.instanceOf(error, CatalogCompositionFailure);
        const missing = error.issues.find(
          (issue) => issue.code === "missing-reference",
        );
        assert.match(missing?.message ?? "", /^Source beta:/);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect(
    "should fail composition naming the official source when the official document declares requires",
    () => {
      const { layer } = routedLayer({
        [officialUrl]: () =>
          json("official", {
            targets: [target("workspace")],
            requires: ["official"],
          }),
      });
      return Effect.gen(function* () {
        const error = yield* Effect.flip(loadSources(select("official")));
        assert.instanceOf(error, CatalogCompositionFailure);
        assert.deepStrictEqual(
          error.issues.map(({ code, fragment, message }) => ({
            code,
            fragment,
            message,
          })),
          [
            {
              code: "invalid-shape",
              fragment: 0,
              message: "Source official cannot require itself",
            },
          ],
        );
        assert.deepStrictEqual(
          error.sources.map((source) => source.name),
          ["official"],
        );
      }).pipe(Effect.provide(layer));
    },
  );
});
