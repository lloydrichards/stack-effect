import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  catalogSourcesFixture,
  errorMessage,
  withNodeServices,
} from "../fixtures/catalogSources";

describe("catalog workspace reset", () => {
  it.effect(
    "should leave modules Deno does not support out of the default workspace",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { run, directory, fs, path } = yield* catalogSourcesFixture;
          const root = path.join(directory, "catalog-deno");

          const { executed } = yield* run([
            "catalog",
            "workspace",
            "reset",
            "--runtime",
            "deno",
            "--root",
            root,
          ]);

          const manifest = yield* fs.readFileString(
            path.join(root, ".catalog-build-manifest.json"),
          );
          assert.include(manifest, '"moduleId"');
          assert.notInclude(manifest, "package-library");
          assert.notInclude(manifest, "cloudflare-worker");
          assert.include(
            executed.map(({ command }) => command),
            "git init --initial-branch=main",
          );
        }),
      ),
    60_000,
  );

  it.effect(
    "should reject an explicit module that Deno does not support",
    () =>
      withNodeServices(
        Effect.gen(function* () {
          const { runFailing, directory, path } = yield* catalogSourcesFixture;

          const { error, executed } = yield* runFailing([
            "catalog",
            "workspace",
            "reset",
            "--runtime",
            "deno",
            "--target",
            "package/library:package-library",
            "--root",
            path.join(directory, "catalog-deno"),
          ]);

          assert.propertyVal(error, "_tag", "BlueprintError");
          assert.include(
            errorMessage(error),
            "Runtime deno does not support module package-library",
          );
          assert.deepStrictEqual(executed, []);
        }),
      ),
    60_000,
  );
});
