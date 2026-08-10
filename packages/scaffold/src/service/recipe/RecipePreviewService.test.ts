import { assert, it } from "@effect/vitest";
import { StackConfig } from "@repo/domain/Scaffold";
import { Effect, Schema } from "effect";
import { RecipePreviewService } from "./RecipePreviewService";

const previewQualityConfig = (
  lint: "biome" | "oxlint",
  format: "dprint" | "oxfmt",
) =>
  Effect.gen(function* () {
    const previews = yield* RecipePreviewService;
    return yield* previews.preview({
      config: new StackConfig({
        name: "quality-app" as typeof Schema.NonEmptyString.Type,
        runtime: { _tag: "bun" },
        monorepo: "turbo",
        lint,
        format,
        test: "vitest",
      }),
      recipe: { targets: [] },
    });
  });

it.effect(
  "should preserve Biome import organization when dprint formatting is selected",
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
      assert.include(
        fileContents(".vscode/settings.json"),
        "source.organizeImports.biome",
      );
    }).pipe(Effect.provide(RecipePreviewService.layer)),
);

it.effect(
  "should generate Oxfmt commands and dependency when Oxfmt formatting is selected",
  () =>
    Effect.gen(function* () {
      const preview = yield* previewQualityConfig("biome", "oxfmt");
      const fileContents = (path: string) =>
        preview.files.find((file) => file.path === path)?.contents;
      const packageJson = JSON.parse(fileContents("package.json") ?? "{}");

      assert.strictEqual(packageJson.scripts.format, "oxfmt");
      assert.strictEqual(packageJson.scripts["format:check"], "oxfmt --check");
      assert.strictEqual(packageJson.devDependencies.oxfmt, "^0.62.0");
      assert.isUndefined(fileContents("dprint.json"));
    }).pipe(Effect.provide(RecipePreviewService.layer)),
);

it.effect(
  "should emit the established Oxfmt policy when Oxfmt formatting is selected",
  () =>
    Effect.gen(function* () {
      const preview = yield* previewQualityConfig("biome", "oxfmt");
      const fileContents = (path: string) =>
        preview.files.find((file) => file.path === path)?.contents;

      assert.deepStrictEqual(
        JSON.parse(fileContents(".oxfmtrc.jsonc") ?? "{}"),
        {
          $schema: "./node_modules/oxfmt/configuration_schema.json",
          printWidth: 80,
          tabWidth: 2,
          useTabs: false,
          semi: true,
          singleQuote: false,
          trailingComma: "all",
          sortImports: false,
          sortTailwindcss: false,
          sortPackageJson: false,
          ignorePatterns: [
            "**/node_modules/**",
            "**/dist/**",
            "**/build/**",
            "**/coverage/**",
            "**/generated/**",
            "**/.cache/**",
            "**/.turbo/**",
          ],
        },
      );
    }).pipe(Effect.provide(RecipePreviewService.layer)),
);

it.effect(
  "should configure the Oxc extension when Oxfmt formatting is selected",
  () =>
    Effect.gen(function* () {
      const preview = yield* previewQualityConfig("biome", "oxfmt");
      const fileContents = (path: string) =>
        preview.files.find((file) => file.path === path)?.contents;

      assert.include(
        fileContents(".vscode/settings.json"),
        '"editor.defaultFormatter": "oxc.oxc-vscode"',
      );
      assert.include(
        fileContents(".vscode/extensions.json"),
        '"recommendations": ["oxc.oxc-vscode"]',
      );
    }).pipe(Effect.provide(RecipePreviewService.layer)),
);

it.effect(
  "should preserve Biome lint configuration when Oxfmt formatting is selected",
  () =>
    Effect.gen(function* () {
      const preview = yield* previewQualityConfig("biome", "oxfmt");
      const fileContents = (path: string) =>
        preview.files.find((file) => file.path === path)?.contents;
      const packageJson = JSON.parse(fileContents("package.json") ?? "{}");

      assert.strictEqual(packageJson.scripts.lint, "biome lint .");
      assert.isDefined(fileContents("biome.jsonc"));
      assert.notInclude(fileContents("biome.jsonc"), '"formatter"');
      assert.include(
        fileContents(".vscode/settings.json"),
        "source.organizeImports.biome",
      );
    }).pipe(Effect.provide(RecipePreviewService.layer)),
);

it.effect(
  "should omit Biome editor actions when Oxlint and Oxfmt are selected",
  () =>
    Effect.gen(function* () {
      const preview = yield* previewQualityConfig("oxlint", "oxfmt");
      const fileContents = (path: string) =>
        preview.files.find((file) => file.path === path)?.contents;

      assert.isUndefined(fileContents("biome.jsonc"));
      assert.notInclude(
        fileContents(".vscode/settings.json"),
        "source.organizeImports.biome",
      );
    }).pipe(Effect.provide(RecipePreviewService.layer)),
);
