import { assert, it } from "@effect/vitest";
import { StackConfig } from "@repo/domain/Scaffold";
import { Effect, Schema } from "effect";
import { RecipePreviewService } from "./RecipePreviewService";

it.effect(
  "should generate Biome linting with dprint formatting when both are selected",
  () =>
    Effect.gen(function* () {
      const previews = yield* RecipePreviewService;
      const preview = yield* previews.preview({
        config: new StackConfig({
          name: "quality-app" as typeof Schema.NonEmptyString.Type,
          runtime: { _tag: "bun" },
          monorepo: "turbo",
          lint: "biome",
          format: "dprint",
          test: "vitest",
        }),
        recipe: { targets: [] },
      });
      const fileContents = (path: string) =>
        preview.files.find((file) => file.path === path)?.contents;
      const packageJson = JSON.parse(fileContents("package.json") ?? "{}");

      assert.strictEqual(packageJson.scripts.lint, "biome lint .");
      assert.strictEqual(packageJson.scripts.format, "dprint fmt");
      assert.strictEqual(packageJson.scripts["format:check"], "dprint check");
      assert.strictEqual(
        packageJson.devDependencies["@biomejs/biome"],
        "2.5.2",
      );
      assert.strictEqual(packageJson.devDependencies.dprint, "^0.54.0");
      assert.isDefined(fileContents("biome.jsonc"));
      assert.isDefined(fileContents("dprint.json"));
      assert.include(
        fileContents(".vscode/settings.json"),
        '"editor.defaultFormatter": "dprint.dprint"',
      );
    }).pipe(Effect.provide(RecipePreviewService.layer)),
);
