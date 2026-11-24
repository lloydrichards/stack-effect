import { assert, describe, it } from "@effect/vitest";
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
import { Effect, FileSystem, Layer } from "effect";
import { pipelineLayer, platform } from "./fixtures/scaffold";

const config = new StackConfig({
  name: "readme-example",
  runtime: { _tag: "bun" },
  typescript: "7",
  monorepo: "turbo",
  lint: "oxlint",
  format: "oxfmt",
  test: "vitest",
});

const target = (kind: string, name: string, ...modules: string[]) => ({
  target: new TargetIdentity({ kind: TargetKind.make(kind), name }),
  modules: modules.map((id) => ModuleId.make(id)),
});

const previewLayer = RecipePreviewer.layer.pipe(
  Layer.provide(platform),

  Layer.provide(OfficialCatalogLayer),
);

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

describe("generated READMEs", () => {
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
        assert.include(root, "](apps/widget-demo)");
        assert.notInclude(root, "apps/widget-demo/README.md");
        assert.isTrue(
          preview.files.some(
            (file) => file.path === "apps/widget-demo/main.ts",
          ),
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
      }).pipe(Effect.provide(previewLayer)),
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
          "apps/client-react-web",
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
          readme(preview, "apps/client-react-web/README.md"),
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
      }).pipe(Effect.provide(previewLayer)),
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
      }).pipe(Effect.provide(previewLayer)),
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
          recipe: { targets: [target("package", "db", "package-db-postgres")] },
        });
        const database = readme(preview, "packages/db/README.md");
        assert.include(database, "deno task db:migrate");
        assert.include(database, "docker compose");
        assert.notInclude(database, "## SQLite storage");
        assert.include(readme(preview), "deno task type-check:all");
        assert.notInclude(readme(preview), "deno run lint");
      }).pipe(Effect.provide(previewLayer)),
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
      }).pipe(
        Effect.provide(
          Layer.provideMerge(
            RecipeResolver.layer,
            pipelineLayer(OfficialCatalogLayer),
          ),
        ),
      ),
  );
});
