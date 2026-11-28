import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { assert, describe, it, layer } from "@effect/vitest";
import { EFFECT_VERSION } from "@repo/catalog-official/dependencies";
import {
  OfficialCatalogLayer,
  officialCatalogLayerWith,
} from "@repo/catalog-official/service";
import { Apply } from "@repo/domain/Apply";
import { ModuleId, TargetIdentity, TargetKind } from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/StackConfig";
import { Applier, RecipePreviewer } from "@repo/scaffold/Apply";
import { BlueprintResolver } from "@repo/scaffold/Blueprint";
import { Planner } from "@repo/scaffold/Plan";
import { RecipeResolver } from "@repo/scaffold/Recipe";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";

const platform = Layer.merge(
  Layer.provideMerge(MemoryFileSystem.layer, BrowserCrypto.layer),
  Path.layer,
);
const applyLayer = Layer.mergeAll(
  RecipeResolver.layer,
  BlueprintResolver.layer,
  Planner.layer,
  Applier.layer,
).pipe(Layer.provideMerge(Layer.merge(platform, OfficialCatalogLayer)));

describe("Official catalog scaffolding", () => {
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

  const TestLayer = RecipePreviewer.layer.pipe(
    Layer.provide(platform),
    Layer.provide(OfficialCatalogLayer),
  );

  const fileAt =
    (preview: {
      readonly files: ReadonlyArray<{ path: string; contents: string }>;
    }) =>
    (path: string) =>
      preview.files.find((file) => file.path === path)?.contents;

  const previewQualityConfig = (
    lint: "biome" | "oxlint",
    format: "dprint" | "oxfmt",
  ) =>
    Effect.gen(function* () {
      const previews = yield* RecipePreviewer;
      return yield* previews.preview({
        config: new StackConfig({
          name: Schema.NonEmptyString.make("quality-app"),
          runtime: { _tag: "bun" },
          monorepo: "turbo",
          lint,
          format,
          test: "vitest",
        }),
        recipe: { targets: [] },
      });
    });

  layer(TestLayer)("RecipePreviewer with the official catalog", (it) => {
    it.effect(
      "should preview SQLite database files when the Deno runtime is selected",
      () =>
        Effect.gen(function* () {
          const previews = yield* RecipePreviewer;
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

          assert.isDefined(fileAt(preview)("packages/db/src/Database.ts"));
        }),
    );

    it.effect(
      "should preserve Biome import organization when dprint formatting is selected",
      () =>
        Effect.gen(function* () {
          const preview = yield* previewQualityConfig("biome", "dprint");
          const fileContents = fileAt(preview);
          const packageJson = decodePackageJson(
            fileContents("package.json") ?? "{}",
          );

          assert.strictEqual(packageJson.scripts["lint"], "biome lint");
          assert.strictEqual(packageJson.scripts["format"], "dprint fmt");
          assert.strictEqual(
            packageJson.scripts["format:check"],
            "dprint check",
          );
          assert.strictEqual(
            packageJson.devDependencies["@biomejs/biome"],
            "2.6.7",
          );
          assert.strictEqual(packageJson.devDependencies["dprint"], "^0.64.3");
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
        }),
    );

    it.effect(
      "should generate Oxfmt commands and dependency when Oxfmt formatting is selected",
      () =>
        Effect.gen(function* () {
          const preview = yield* previewQualityConfig("biome", "oxfmt");
          const fileContents = fileAt(preview);
          const packageJson = decodePackageJson(
            fileContents("package.json") ?? "{}",
          );

          assert.strictEqual(packageJson.scripts["format"], "oxfmt");
          assert.strictEqual(
            packageJson.scripts["format:check"],
            "oxfmt --check",
          );
          assert.isNotEmpty(packageJson.devDependencies["oxfmt"]);
          assert.isUndefined(fileContents("dprint.json"));
        }),
    );

    it.effect(
      "should configure the Oxc extension when Oxfmt formatting is selected",
      () =>
        Effect.gen(function* () {
          const preview = yield* previewQualityConfig("biome", "oxfmt");
          const fileContents = fileAt(preview);

          assert.include(
            fileContents(".vscode/settings.json"),
            '"editor.defaultFormatter": "oxc.oxc-vscode"',
          );
          assert.include(
            fileContents(".vscode/extensions.json"),
            '"recommendations": ["oxc.oxc-vscode"]',
          );
        }),
    );

    it.effect(
      "should preserve Biome lint configuration when Oxfmt formatting is selected",
      () =>
        Effect.gen(function* () {
          const preview = yield* previewQualityConfig("biome", "oxfmt");
          const fileContents = fileAt(preview);
          const packageJson = decodePackageJson(
            fileContents("package.json") ?? "{}",
          );

          assert.strictEqual(packageJson.scripts["lint"], "biome lint");
          assert.isDefined(fileContents("biome.jsonc"));
          assert.notInclude(fileContents("biome.jsonc"), '"formatter"');
          assert.propertyVal(
            UnknownFromJsonString(fileContents(".oxfmtrc.jsonc") ?? "{}"),
            "sortImports",
            false,
          );
          assert.include(
            fileContents(".vscode/settings.json"),
            "source.organizeImports.biome",
          );
        }),
    );

    it.effect(
      "should omit Biome editor actions when Oxlint and Oxfmt are selected",
      () =>
        Effect.gen(function* () {
          const preview = yield* previewQualityConfig("oxlint", "oxfmt");
          const fileContents = fileAt(preview);

          assert.isUndefined(fileContents("biome.jsonc"));
          assert.notInclude(
            fileContents(".vscode/settings.json"),
            "source.organizeImports.biome",
          );
        }),
    );

    it.effect(
      "should generate standalone Oxlint when monorepo is omitted",
      () =>
        Effect.gen(function* () {
          const previews = yield* RecipePreviewer;
          const preview = yield* previews.preview({
            config: new StackConfig({
              name: Schema.NonEmptyString.make("quality-app"),
              runtime: { _tag: "bun" },
              typescript: "7",
              lint: "oxlint",
            }),
            recipe: { targets: [] },
          });
          const fileContents = fileAt(preview);
          const packageJson = decodePackageJson(
            fileContents("package.json") ?? "{}",
          );

          assert.strictEqual(packageJson.scripts["lint"], "oxlint");
          assert.strictEqual(packageJson.scripts["lint:fix"], "oxlint --fix");
          assert.isNotEmpty(packageJson.devDependencies["oxlint"]);
          assert.isNotEmpty(packageJson.devDependencies["oxlint-tsgolint"]);
          assert.include(
            fileContents(".oxlintrc.json"),
            "oxlint-presets/effect-native.json",
          );
        }),
    );
  });

  const target = (kind: string, name: string, ...modules: string[]) => ({
    target: new TargetIdentity({ kind: TargetKind.make(kind), name }),
    modules: modules.map((id) => ModuleId.make(id)),
  });

  describe("generated READMEs", () => {
    const config = new StackConfig({
      name: "readme-example",
      runtime: { _tag: "bun" },
      typescript: "7",
      monorepo: "turbo",
      lint: "oxlint",
      format: "oxfmt",
      test: "vitest",
    });

    const readme = (
      preview: {
        readonly files: ReadonlyArray<{ path: string; contents: string }>;
      },
      path = "README.md",
    ) => {
      const file = preview.files.find((file) => file.path === path);
      assert.isDefined(file, `Missing ${path}`);
      assert.notMatch(file.contents, /\{\{.*?\}\}/);
      return file.contents;
    };

    it.effect(
      "links catalog extension workspaces without assuming they provide a README",
      () =>
        Effect.gen(function* () {
          const previews = yield* RecipePreviewer;
          const preview = yield* previews.preview({
            config,
            recipe: { targets: [target("widget", "demo")] },
          });
          const root = readme(preview);
          assert.include(root, "](apps/demo)");
          assert.notInclude(root, "apps/demo/README.md");
          assert.isTrue(
            preview.files.some((file) => file.path === "apps/demo/main.ts"),
          );
        }).pipe(
          Effect.provide(
            RecipePreviewer.layer.pipe(
              Layer.provide(platform),
              Layer.provide(
                officialCatalogLayerWith([
                  {
                    targets: [
                      {
                        kind: TargetKind.make("widget"),
                        title: "Widget",
                        description: "A catalog extension workspace",
                        requiredModules: [],
                        contributions: [
                          {
                            _tag: "file",
                            path: "{{targetPath}}/main.ts",
                            contents: "export const widget = true;\n",
                          },
                        ],
                      },
                    ],
                    modules: [],
                  },
                ]),
              ),
            ),
          ),
        ),
    );

    it.effect(
      "introduces an empty workspace with its initial recipe and docs",
      () =>
        Effect.gen(function* () {
          const previews = yield* RecipePreviewer;
          const preview = yield* previews.preview({
            config,
            recipe: { targets: [] },
          });
          const root = readme(preview);
          assert.include(root, "bun install");
          assert.include(root, "no application yet");
          assert.notInclude(root, "`bun run dev`");
          assert.include(root, "## Initial scaffold recipe");
          assert.include(root, "stack-effect@latest create readme-example");
          assert.include(root, "https://stack-effect.lloydrichards.dev");
          assert.notInclude(root, "--target server/");
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "links implied full-stack targets and explains their selected database",
      () =>
        Effect.gen(function* () {
          const previews = yield* RecipePreviewer;
          const preview = yield* previews.preview({
            config,
            recipe: {
              targets: [
                target("client-react", "web", "client-react-http-api-todos"),
                target("server", "api", "server-http-api-todos"),
                target("package", "db", "package-db-sqlite"),
              ],
            },
          });
          const root = readme(preview);
          for (const path of [
            "apps/web",
            "apps/server-api",
            "packages/domain",
            "packages/db",
          ]) {
            assert.include(root, `](${path})`);
            readme(preview, `${path}/README.md`);
          }
          assert.include(root, "--target server/api:");
          assert.include(root, "--target package/db:");
          assert.include(
            readme(preview, "apps/web/README.md"),
            "VITE_SERVER_URL",
          );
          assert.include(
            readme(preview, "apps/server-api/README.md"),
            "ALLOWED_ORIGINS",
          );
          const database = readme(preview, "packages/db/README.md");
          assert.include(database, "bun run db:migrate");
          assert.include(database, "data/app.sqlite");
          assert.notInclude(database, "## Postgres setup");
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "keeps publishing guidance and root links for a nested library",
      () =>
        Effect.gen(function* () {
          const previews = yield* RecipePreviewer;
          const preview = yield* previews.preview({
            config: new StackConfig({
              ...config,
              runtime: { _tag: "node", packageManager: "pnpm" },
            }),
            recipe: {
              targets: [target("package", "sdk/client", "package-library")],
            },
          });
          const library = readme(preview, "packages/sdk/client/README.md");
          assert.include(library, "# @repo/sdk-client");
          assert.include(library, "../../../README.md#get-started");
          assert.include(library, 'from "@repo/sdk-client"');
          assert.include(library, "npm run pack");
          assert.include(library, "compiled entry point");
          assert.include(readme(preview), "pnpm install");
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "uses Deno tasks and only documents the selected Postgres database",
      () =>
        Effect.gen(function* () {
          const previews = yield* RecipePreviewer;
          const preview = yield* previews.preview({
            config: new StackConfig({
              name: config.name,
              runtime: { _tag: "deno" },
            }),
            recipe: {
              targets: [target("package", "db", "package-db-postgres")],
            },
          });
          const database = readme(preview, "packages/db/README.md");
          assert.include(database, "deno task db:migrate");
          assert.include(database, "docker compose");
          assert.notInclude(database, "## SQLite storage");
          assert.include(readme(preview), "deno task type-check:all");
          assert.notInclude(readme(preview), "deno run lint");
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect(
      "keeps a compatible Effect range when adding an unrelated module",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const recipes = yield* RecipeResolver;
          const blueprints = yield* BlueprintResolver;
          const plans = yield* Planner;
          const applies = yield* Applier;
          const resolve = (modules: ReadonlyArray<string>) =>
            recipes
              .resolve(
                { targets: modules.map((id) => target("server", "api", id)) },
                { config, providerStrategy: { _tag: "fail-on-ambiguous" } },
              )
              .pipe(
                Effect.flatMap((selection) =>
                  blueprints.resolve(selection, config),
                ),
                Effect.flatMap((blueprint) =>
                  plans.build({ blueprint, config, repositoryRoot: "/repo" }),
                ),
              );
          yield* fs.makeDirectory("/repo", { recursive: true });
          yield* applies.apply({
            apply: new Apply({
              plan: yield* resolve(["server-http-api"]),
              decisions: [],
            }),
            repositoryRoot: "/repo",
          });
          const manifestPath = "/repo/apps/server-api/package.json";
          const manifest = yield* fs.readFileString(manifestPath);
          yield* fs.writeFileString(
            manifestPath,
            manifest.replace(/"effect": "[^"]+"/, '"effect": "^4.1.4"'),
          );

          const plan = yield* resolve(["server-http-api", "server-devtools"]);

          assert.deepStrictEqual(
            plan.conflicts
              .filter(
                (conflict) => conflict.path === "apps/server-api/package.json",
              )
              .map((conflict) => conflict.path),
            [],
          );
        }).pipe(Effect.provide(applyLayer)),
    );

    it.effect(
      "requires an Effect upgrade and preserves customized Workshop Checklist instructions",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const recipes = yield* RecipeResolver;
          const blueprints = yield* BlueprintResolver;
          const plans = yield* Planner;
          const applies = yield* Applier;
          const skillPath = "apps/remote/src/skills/WorkshopChecklistSkill.ts";
          const customSkill =
            "// Custom packing instructions: bring spare labels.\n";
          yield* fs.makeDirectory("/repo/apps/remote/src/skills", {
            recursive: true,
          });
          yield* fs.writeFileString(`/repo/${skillPath}`, customSkill);
          const manifestPath = "apps/remote/package.json";
          yield* fs.writeFileString(
            `/repo/${manifestPath}`,
            '{"name":"server-mcp-remote","dependencies":{"effect":"4.1.4"}}',
          );

          const selection = yield* recipes.resolve(
            {
              targets: [
                target("server-mcp", "remote", "mcp-skill-workshop-checklist"),
              ],
            },
            { config, providerStrategy: { _tag: "fail-on-ambiguous" } },
          );
          const blueprint = yield* blueprints.resolve(selection, config);
          const plan = yield* plans.build({
            blueprint,
            config,
            repositoryRoot: "/repo",
          });

          assert.isTrue(
            plan.conflicts.some(
              (conflict) =>
                conflict._tag === "dependencies" &&
                conflict.path === manifestPath &&
                conflict.section === "dependencies" &&
                conflict.name === "effect" &&
                conflict.currentVersion === "4.1.4" &&
                conflict.requiredVersion === EFFECT_VERSION,
            ),
          );

          yield* fs.writeFileString(
            `/repo/${manifestPath}`,
            `{"name":"server-mcp-remote","dependencies":{"effect":"${EFFECT_VERSION}"}}`,
          );
          const upgradedPlan = yield* plans.build({
            blueprint,
            config,
            repositoryRoot: "/repo",
          });
          assert.isTrue(
            upgradedPlan.conflicts.some(
              (conflict) => conflict.path === skillPath,
            ),
          );
          const decisions = [
            ...new Set(upgradedPlan.conflicts.map((conflict) => conflict.path)),
          ].map((path) => ({ path, value: "skip" as const }));
          yield* applies.apply({
            apply: new Apply({ plan: upgradedPlan, decisions }),
            repositoryRoot: "/repo",
          });
          assert.strictEqual(
            yield* fs.readFileString(`/repo/${skillPath}`),
            customSkill,
          );
        }).pipe(Effect.provide(applyLayer)),
    );

    it.effect(
      "preserves edited root and local READMEs when adding a module",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const recipes = yield* RecipeResolver;
          const blueprints = yield* BlueprintResolver;
          const plans = yield* Planner;
          const applies = yield* Applier;
          const initial = yield* recipes.resolve(
            { targets: [target("server", "api", "server-http-api")] },
            { config, providerStrategy: { _tag: "fail-on-ambiguous" } },
          );
          const initialBlueprint = yield* blueprints.resolve(initial, config);
          yield* fs.makeDirectory("/repo", { recursive: true });
          const first = yield* plans.build({
            blueprint: initialBlueprint,
            config,
            repositoryRoot: "/repo",
          });
          yield* applies.apply({
            apply: new Apply({ plan: first, decisions: [] }),
            repositoryRoot: "/repo",
          });
          const originalRoot = yield* fs.readFileString("/repo/README.md");
          const edits = [
            ["README.md", `${originalRoot}\nCustom onboarding instructions.\n`],
            [
              "apps/server-api/README.md",
              "# Our API\n\nCustom operations guide.\n",
            ],
            [
              "packages/domain/README.md",
              "# Our contracts\n\nCustom contract guide.\n",
            ],
          ] as const;
          yield* Effect.forEach(edits, ([path, contents]) =>
            fs.writeFileString(`/repo/${path}`, contents),
          );
          const selection = yield* recipes.resolve(
            {
              targets: [
                target("server", "api", "server-http-api-todos"),
                target("package", "db", "package-db-sqlite"),
              ],
            },
            { config, providerStrategy: { _tag: "fail-on-ambiguous" } },
          );
          const blueprint = yield* blueprints.resolve(selection, config);
          const plan = yield* plans.build({
            blueprint,
            config,
            repositoryRoot: "/repo",
          });
          for (const [path] of edits) {
            assert.isTrue(
              plan.conflicts.some((conflict) => conflict.path === path),
              `${path} must require explicit replacement`,
            );
          }
          const decisions = [
            ...new Set(plan.conflicts.map((conflict) => conflict.path)),
          ].map((path) => ({ path, value: "skip" as const }));
          yield* applies.apply({
            apply: new Apply({ plan, decisions }),
            repositoryRoot: "/repo",
          });
          for (const [path, contents] of edits) {
            assert.strictEqual(
              yield* fs.readFileString(`/repo/${path}`),
              contents,
            );
          }
          assert.isTrue(yield* fs.exists("/repo/packages/db/README.md"));
          assert.isTrue(
            yield* fs.exists("/repo/apps/server-api/src/api/Todo.ts"),
          );
        }).pipe(Effect.provide(applyLayer)),
    );
  });

  describe("Alchemy deployment", () => {
    const preview = (kind: string, modules: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        const service = yield* RecipePreviewer;
        return yield* service.preview({
          config: new StackConfig({
            name: Schema.NonEmptyString.make("deployment"),
            runtime: { _tag: "bun" },
          }),
          recipe: {
            targets: [
              {
                target: new TargetIdentity({
                  kind: TargetKind.make(kind),
                  name: kind === "workspace" ? "root" : "app",
                }),
                modules: modules.map((id) => ModuleId.make(id)),
              },
            ],
          },
        });
      }).pipe(Effect.provide(TestLayer));

    it.effect("ordinary applications do not acquire infrastructure", () =>
      Effect.gen(function* () {
        const result = yield* preview("client-foldkit", []);
        assert.isFalse(
          result.files.some((file) => file.path === "alchemy.run.ts"),
        );
        assert.notInclude(
          result.files.find((file) => file.path === "package.json")?.contents ??
            "",
          '"alchemy"',
        );
      }),
    );

    for (const kind of ["client-foldkit", "client-react"]) {
      it.effect(`${kind} deployment adds no backend or HTTP feature`, () =>
        Effect.gen(function* () {
          const result = yield* preview(kind, [`alchemy-${kind}-website`]);
          assert.isTrue(
            result.files.some((file) => file.path === "apps/app/alchemy.ts"),
          );
          assert.isFalse(
            result.files.some(
              (file) =>
                file.path.startsWith("apps/") &&
                !file.path.startsWith("apps/app/"),
            ),
          );
          const root =
            result.files.find((file) => file.path === "alchemy.run.ts")
              ?.contents ?? "";
          assert.include(root, "const Applications = Effect.all({})");
          assert.notInclude(root, "./apps/");
        }),
      );
    }

    it.effect(
      "Worker deployment scaffolds the shared API independently of a frontend",
      () =>
        Effect.gen(function* () {
          const result = yield* preview("cloudflare-worker", [
            "alchemy-worker-deployment",
          ]);
          assert.isFalse(
            result.files.some(
              (file) =>
                file.path.startsWith("apps/") &&
                !file.path.startsWith("apps/app/"),
            ),
          );
          assert.notInclude(
            result.files.find(
              (file) =>
                file.path.endsWith("/src/Api.ts") &&
                file.path.startsWith("apps/"),
            )?.contents ?? "",
            "alchemy/",
          );
          assert.include(
            result.files.find((file) => file.path === "apps/app/alchemy.ts")
              ?.contents ?? "",
            "HttpRouter.toHttpEffect",
          );
        }),
    );

    it.effect(
      "the Worker HTTP client adds the shared contract without creating a backend or deployment",
      () =>
        Effect.gen(function* () {
          const result = yield* preview("client-foldkit", [
            "client-foldkit-http-api-worker",
          ]);
          assert.isFalse(
            result.files.some(
              (file) =>
                file.path.startsWith("apps/") &&
                !file.path.startsWith("apps/app/"),
            ),
          );
          assert.isTrue(
            result.files.some(
              (file) => file.path === "packages/domain/src/Api.ts",
            ),
          );
          assert.isFalse(
            result.files.some((file) => file.path === "alchemy.run.ts"),
          );
          assert.isTrue(
            result.files.some((file) =>
              file.path.endsWith("/src/features/rest.ts"),
            ),
          );
        }),
    );

    it.effect(
      "CAFE adds optional Foldkit modules and imports the deployment packages by name",
      () =>
        Effect.gen(function* () {
          const previews = yield* RecipePreviewer;
          const result = yield* previews.preview({
            config: new StackConfig({
              name: "deployment",
              runtime: { _tag: "bun" },
            }),
            recipe: {
              targets: [
                target("workspace", "root", "workspace-alchemy-cafe"),
                target("client-foldkit", "", "client-foldkit-devtools"),
              ],
            },
          });
          const stack =
            result.files.find(({ path }) => path === "alchemy.run.ts")
              ?.contents ?? "";
          const paths = result.files.map(({ path }) => path);
          assert.includeMembers(paths, [
            "apps/client/alchemy.ts",
            "apps/client/src/devtools.ts",
            "apps/client/src/features/rest.ts",
            "apps/cloudflare-worker-api/alchemy.ts",
            "apps/cloudflare-worker-api/src/Api.ts",
            "packages/domain/src/Api.ts",
            "packages/config-typescript/vite.json",
          ]);
          assert.include(result.command, "--target client-foldkit/:");
          assert.include(stack, '"client-foldkit/alchemy"');
          assert.include(stack, '"cloudflare-worker-api/alchemy"');
          assert.include(
            stack,
            "Website({ VITE_SERVER_URL: api.url.as<string>() })",
          );
          assert.include(stack, "return { api: api.url, web: web.url }");
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("CAFE links deployment exports from moved packages", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const recipes = yield* RecipeResolver;
        const blueprints = yield* BlueprintResolver;
        const plans = yield* Planner;
        const applies = yield* Applier;
        const repositoryRoot = "/repo";
        const client = "apps/frontend/site";
        const worker = "apps/backend/worker";
        const config = new StackConfig({
          name: "deployment",
          runtime: { _tag: "bun" },
        });
        for (const [directory, name] of [
          [client, "client-foldkit"],
          [worker, "cloudflare-worker-api"],
        ]) {
          yield* fs.makeDirectory(`${repositoryRoot}/${directory}`, {
            recursive: true,
          });
          yield* fs.writeFileString(
            `${repositoryRoot}/${directory}/package.json`,
            JSON.stringify({ name }),
          );
        }

        const selection = yield* recipes.resolve(
          {
            targets: [target("workspace", "root", "workspace-alchemy-cafe")],
          },
          { config, providerStrategy: { _tag: "fail-on-ambiguous" } },
        );
        const blueprint = yield* blueprints.resolve(selection, config);
        const plan = yield* plans.build({ blueprint, config, repositoryRoot });
        const result = yield* applies.apply({
          apply: new Apply({ plan, decisions: [] }),
          repositoryRoot,
        });

        assert.deepStrictEqual(result.failed, []);
        for (const directory of [client, worker]) {
          assert.isTrue(
            yield* fs.exists(`${repositoryRoot}/${directory}/alchemy.ts`),
          );
          assert.include(
            yield* fs.readFileString(
              `${repositoryRoot}/${directory}/package.json`,
            ),
            '"./alchemy": "./alchemy.ts"',
          );
        }
        const root = yield* fs.readFileString(`${repositoryRoot}/package.json`);
        assert.include(root, '"client-foldkit": "workspace:*"');
        assert.include(root, '"cloudflare-worker-api": "workspace:*"');
        assert.isFalse(yield* fs.exists(`${repositoryRoot}/apps/client`));
        assert.isFalse(
          yield* fs.exists(`${repositoryRoot}/apps/cloudflare-worker-api`),
        );
      }).pipe(Effect.provide(applyLayer)),
    );
  });
});
