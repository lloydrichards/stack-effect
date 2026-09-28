import { assert, it } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import {
  OfficialCatalogLayer,
  officialCatalogLayerWith,
} from "@repo/catalog-official/service";
import {
  ModuleId,
  TargetIdentity,
  TargetKind,
  type ModuleDefinition,
} from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import { Effect, Graph, Layer, Schema } from "effect";
import { RecipePreviewService } from "./RecipePreviewService";

const PackageJsonFromJsonString = Schema.fromJsonString(
  Schema.Struct({
    scripts: Schema.Record(Schema.String, Schema.String),
    devDependencies: Schema.Record(Schema.String, Schema.String),
  }),
);
const UnknownFromJsonString = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Json),
);
const decodePackageJson = Schema.decodeUnknownSync(PackageJsonFromJsonString);

it.effect(
  "plans and previews a module supplied outside the built-in registry",
  () => {
    const extra: typeof ModuleDefinition.Type = {
      id: ModuleId.make("package-extra-example"),
      title: "Extra example",
      description: "A contributed file",
      supportedOn: [{ _tag: "kind", kind: TargetKind.make("package") }],
      dependencies: [],
      contributions: [
        {
          _tag: "file",
          path: "{{targetPath}}/extra.txt",
          contents: "from fragment\n",
        },
      ],
    };
    const catalogLayer = officialCatalogLayerWith([
      { targets: [], modules: [extra] },
    ]);
    return Effect.gen(function* () {
      const catalog = yield* CatalogService;
      const previews = yield* RecipePreviewService;
      const projection = yield* catalog.toBuilderCatalog([
        new TargetIdentity({ kind: TargetKind.make("package"), name: "extra" }),
      ]);
      assert.isTrue(
        projection.targetModules[0]?.modules.some(
          (module) => module.id === extra.id,
        ),
      );
      assert.isTrue(
        catalog.toCatalogTree.targets.some((target) =>
          target.modules.some((module) => module.id === extra.id),
        ),
      );
      assert.isTrue(
        [...Graph.nodes(catalog.toGraph)].some(
          ([, node]) =>
            node._tag === "module" && node.definition.id === extra.id,
        ),
      );
      const preview = yield* previews.preview({
        config: new StackConfig({
          name: Schema.NonEmptyString.make("extra-project"),
          runtime: { _tag: "bun" },
        }),
        recipe: {
          targets: [
            {
              target: new TargetIdentity({
                kind: TargetKind.make("package"),
                name: "extra",
              }),
              modules: [extra.id],
            },
          ],
        },
      });
      assert.isTrue(
        preview.blueprint.nodes.some(
          (node) =>
            node._tag === "attached-module" && node.moduleId === extra.id,
        ),
      );
      assert.strictEqual(
        preview.files.find((file) => file.path === "packages/extra/extra.txt")
          ?.contents,
        "from fragment\n",
      );
    }).pipe(
      Effect.provide(
        RecipePreviewService.layer.pipe(Layer.provideMerge(catalogLayer)),
      ),
    );
  },
);

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

it.effect("should preview Deno SQLite files", () =>
  Effect.gen(function* () {
    const previews = yield* RecipePreviewService;
    const preview = yield* previews.preview({
      config: new StackConfig({
        name: Schema.NonEmptyString.make("deno-preview"),
        runtime: { _tag: "deno" },
        typescript: "6",
      }),
      recipe: {
        targets: [
          {
            target: new TargetIdentity({
              kind: TargetKind.make("package"),
              name: "db",
            }),
            modules: [ModuleId.make("package-db-sqlite")],
          },
        ],
      },
    });

    assert.isTrue(
      preview.files.some((file) => file.path === "packages/db/src/Database.ts"),
    );
  }).pipe(
    Effect.provide(
      RecipePreviewService.layer.pipe(Layer.provide(OfficialCatalogLayer)),
    ),
  ),
);

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
      const packageJson = decodePackageJson(
        fileContents("package.json") ?? "{}",
      );

      assert.strictEqual(packageJson.scripts["lint"], "biome lint");
      assert.strictEqual(packageJson.scripts["format"], "dprint fmt");
      assert.strictEqual(packageJson.scripts["format:check"], "dprint check");
      assert.strictEqual(
        packageJson.devDependencies["@biomejs/biome"],
        "2.5.2",
      );
      assert.strictEqual(packageJson.devDependencies["dprint"], "^0.54.0");
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
    }).pipe(
      Effect.provide(
        RecipePreviewService.layer.pipe(Layer.provide(OfficialCatalogLayer)),
      ),
    ),
);

it.effect(
  "should generate Oxfmt commands and dependency when Oxfmt formatting is selected",
  () =>
    Effect.gen(function* () {
      const preview = yield* previewQualityConfig("biome", "oxfmt");
      const fileContents = (path: string) =>
        preview.files.find((file) => file.path === path)?.contents;
      const packageJson = decodePackageJson(
        fileContents("package.json") ?? "{}",
      );

      assert.strictEqual(packageJson.scripts["format"], "oxfmt");
      assert.strictEqual(packageJson.scripts["format:check"], "oxfmt --check");
      assert.strictEqual(packageJson.devDependencies["oxfmt"], "^0.65.0");
      assert.isUndefined(fileContents("dprint.json"));
    }).pipe(
      Effect.provide(
        RecipePreviewService.layer.pipe(Layer.provide(OfficialCatalogLayer)),
      ),
    ),
);

it.effect(
  "should emit the established Oxfmt policy when Oxfmt formatting is selected",
  () =>
    Effect.gen(function* () {
      const preview = yield* previewQualityConfig("biome", "oxfmt");
      const fileContents = (path: string) =>
        preview.files.find((file) => file.path === path)?.contents;

      assert.deepStrictEqual(
        UnknownFromJsonString(fileContents(".oxfmtrc.jsonc") ?? "{}"),
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
    }).pipe(
      Effect.provide(
        RecipePreviewService.layer.pipe(Layer.provide(OfficialCatalogLayer)),
      ),
    ),
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
    }).pipe(
      Effect.provide(
        RecipePreviewService.layer.pipe(Layer.provide(OfficialCatalogLayer)),
      ),
    ),
);

it.effect(
  "should preserve Biome lint configuration when Oxfmt formatting is selected",
  () =>
    Effect.gen(function* () {
      const preview = yield* previewQualityConfig("biome", "oxfmt");
      const fileContents = (path: string) =>
        preview.files.find((file) => file.path === path)?.contents;
      const packageJson = decodePackageJson(
        fileContents("package.json") ?? "{}",
      );

      assert.strictEqual(packageJson.scripts["lint"], "biome lint");
      assert.isDefined(fileContents("biome.jsonc"));
      assert.notInclude(fileContents("biome.jsonc"), '"formatter"');
      assert.include(
        fileContents(".vscode/settings.json"),
        "source.organizeImports.biome",
      );
    }).pipe(
      Effect.provide(
        RecipePreviewService.layer.pipe(Layer.provide(OfficialCatalogLayer)),
      ),
    ),
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
    }).pipe(
      Effect.provide(
        RecipePreviewService.layer.pipe(Layer.provide(OfficialCatalogLayer)),
      ),
    ),
);

it.effect("should generate standalone Oxlint when monorepo is omitted", () =>
  Effect.gen(function* () {
    const previews = yield* RecipePreviewService;
    const preview = yield* previews.preview({
      config: new StackConfig({
        name: "quality-app" as typeof Schema.NonEmptyString.Type,
        runtime: { _tag: "bun" },
        typescript: "7",
        lint: "oxlint",
      }),
      recipe: { targets: [] },
    });
    const fileContents = (path: string) =>
      preview.files.find((file) => file.path === path)?.contents;
    const packageJson = decodePackageJson(fileContents("package.json") ?? "{}");

    assert.strictEqual(packageJson.scripts["lint"], "oxlint");
    assert.strictEqual(packageJson.scripts["lint:fix"], "oxlint --fix");
    assert.strictEqual(packageJson.devDependencies["oxlint"], "1.80.0");
    assert.strictEqual(
      packageJson.devDependencies["oxlint-tsgolint"],
      "7.0.2001",
    );
    assert.include(
      fileContents(".oxlintrc.json"),
      "oxlint-presets/effect-native.json",
    );
  }).pipe(
    Effect.provide(
      RecipePreviewService.layer.pipe(Layer.provide(OfficialCatalogLayer)),
    ),
  ),
);
