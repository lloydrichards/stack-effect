import { assert, it } from "@effect/vitest";
import {
  DddArchitecture,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
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

it.effect("previews the exact guided DDD Todo architecture intent", () =>
  Effect.gen(function* () {
    const previews = yield* RecipePreviewService;
    const preview = yield* previews.preview({
      config: new StackConfig({
        name: "ddd-app" as typeof Schema.NonEmptyString.Type,
        runtime: { _tag: "bun" },
        monorepo: "turbo",
        lint: "biome",
        format: "biome",
        test: "vitest",
      }),
      recipe: {
        targets: [
          {
            target: new TargetIdentity({
              kind: TargetKind.make("workspace"),
              name: "ddd-app",
            }),
            modules: [ModuleId.make("workspace-devenv-git")],
          },
          {
            target: new TargetIdentity({
              kind: TargetKind.make("server"),
              name: "api",
            }),
            modules: [ModuleId.make("server-http-api-todos")],
            architecture: DddArchitecture,
          },
        ],
      },
    });
    const target = preview.blueprint.nodes.find(
      (node) =>
        node._tag === "target" &&
        node.identity.kind === "server" &&
        node.identity.name === "api",
    );
    const paths = preview.files.map((file) => file.path);
    const manifest = JSON.parse(
      preview.files.find((file) => file.path === "stack.effect.json")
        ?.contents ?? "{}",
    );

    assert.strictEqual(
      preview.selection.targets.find(
        ({ identity }) => identity.kind === "server" && identity.name === "api",
      )?.architecture,
      "ddd",
    );
    assert.strictEqual(
      target?._tag === "target" ? target.architecture : undefined,
      "ddd",
    );
    assert.strictEqual(
      target?._tag === "target" ? target.layout.path : undefined,
      "apps/server-api",
    );
    assert.strictEqual(
      target?._tag === "target" ? target.layout.packageName : undefined,
      "server-api",
    );
    assert.include(
      preview.command,
      "--target server/api:server-http-api-todos --architecture ddd",
    );
    [
      "apps/server-api/package.json",
      "packages/shared/domain/package.json",
      "packages/todo/domain/package.json",
      "packages/todo/application/package.json",
      "packages/todo/infrastructure/package.json",
      "packages/todo/presentation/package.json",
    ].forEach((path) => assert.include(paths, path));
    assert.deepStrictEqual(manifest.targets, [
      { identity: { kind: "server", name: "api" }, architecture: "ddd" },
      {
        identity: { kind: "package", name: "shared-domain" },
        architecture: "ddd",
      },
      {
        identity: { kind: "package", name: "todo-application" },
        architecture: "ddd",
      },
      {
        identity: { kind: "package", name: "todo-domain" },
        architecture: "ddd",
      },
      {
        identity: { kind: "package", name: "todo-infrastructure" },
        architecture: "ddd",
      },
      {
        identity: { kind: "package", name: "todo-presentation" },
        architecture: "ddd",
      },
    ]);
  }).pipe(Effect.provide(RecipePreviewService.layer)),
);
it.effect("projects exact deterministic additive DDD provider plans", () =>
  Effect.gen(function* () {
    const previews = yield* RecipePreviewService;
    const baseFiles = [
      "apps/server-api/package.json",
      "apps/server-api/src/index.ts",
      "packages/shared/domain/package.json",
      "packages/todo/domain/test/http.test.ts",
      "packages/todo/domain/test/todo.test.ts",
      "packages/todo/application/test/use-cases.test.ts",
      "packages/todo/infrastructure/test/memory.test.ts",
      "packages/todo/presentation/test/http.test.ts",
    ];
    const providerCases = [
      { providers: [], files: [], keys: ["memory"] },
      {
        providers: ["server-http-api-todos-provider-sqlite"],
        files: [
          "packages/todo/infrastructure/.env.sqlite.example",
          "packages/todo/infrastructure/src/migrations/sqlite/0001_create_todos.ts",
          "packages/todo/infrastructure/src/sqlite.ts",
          "packages/todo/infrastructure/test/sqlite.test.ts",
          "data/.gitignore",
        ],
        keys: ["memory", "sqlite"],
      },
      {
        providers: ["server-http-api-todos-provider-postgres"],
        files: [
          "packages/todo/infrastructure/.env.postgres.example",
          "packages/todo/infrastructure/docker-compose.yml",
          "packages/todo/infrastructure/src/migrations/postgres/0001_create_todos.ts",
          "packages/todo/infrastructure/src/postgres.ts",
        ],
        keys: ["memory", "postgres"],
      },
      {
        providers: [
          "server-http-api-todos-provider-sqlite",
          "server-http-api-todos-provider-postgres",
        ],
        files: [
          "packages/todo/infrastructure/.env.postgres.example",
          "packages/todo/infrastructure/.env.sqlite.example",
          "packages/todo/infrastructure/docker-compose.yml",
          "packages/todo/infrastructure/src/migrations/postgres/0001_create_todos.ts",
          "packages/todo/infrastructure/src/migrations/sqlite/0001_create_todos.ts",
          "packages/todo/infrastructure/src/postgres.ts",
          "packages/todo/infrastructure/src/sqlite.ts",
          "packages/todo/infrastructure/test/sqlite.test.ts",
          "data/.gitignore",
        ],
        keys: ["memory", "sqlite", "postgres"],
      },
    ] as const;
    for (const expected of providerCases) {
      const input = {
        config: new StackConfig({
          name: "ddd-providers" as typeof Schema.NonEmptyString.Type,
          runtime: { _tag: "node", packageManager: "npm" },
          monorepo: "turbo",
          lint: "biome",
          format: "biome",
          test: "vitest",
        }),
        recipe: {
          targets: [
            {
              target: new TargetIdentity({
                kind: TargetKind.make("server"),
                name: "api",
              }),
              modules: [
                ModuleId.make("server-http-api-todos"),
                ...expected.providers.map(ModuleId.make),
              ],
              architecture: DddArchitecture,
            },
          ],
        },
      };
      const preview = yield* previews.preview(input);
      const repeated = yield* previews.preview(input);
      const paths = preview.files.map(({ path }) => path);
      const infrastructure = JSON.parse(
        preview.files.find(
          ({ path }) => path === "packages/todo/infrastructure/package.json",
        )?.contents ?? "{}",
      );
      const host =
        preview.files.find(
          ({ path }) => path === "apps/server-api/src/index.ts",
        )?.contents ?? "";
      const presentation =
        preview.files.find(
          ({ path }) => path === "packages/todo/presentation/src/http.ts",
        )?.contents ?? "";
      const domainApi =
        preview.files.find(
          ({ path }) => path === "packages/todo/domain/src/api.http.ts",
        )?.contents ?? "";
      const domainPackage = JSON.parse(
        preview.files.find(
          ({ path }) => path === "packages/todo/domain/package.json",
        )?.contents ?? "{}",
      );
      const hostPackage = JSON.parse(
        preview.files.find(
          ({ path }) => path === "apps/server-api/package.json",
        )?.contents ?? "{}",
      );
      const hostPackageName = hostPackage.name;
      const artifact = {
        command: preview.command,
        selection: preview.selection.targets.flatMap(
          ({ identity, modules, architecture }) => [
            `${identity.kind}/${identity.name}`,
            architecture ?? "classic",
            ...modules.map(({ id }) => id).sort(),
          ],
        ),
        blueprint: preview.blueprint.nodes.flatMap((node) =>
          node._tag === "target"
            ? [
                `${node.identity.kind}/${node.identity.name}|${node.architecture}|${node.layout.path}|${node.layout.packageName}`,
              ]
            : [],
        ),
        paths: paths
          .filter(
            (path) =>
              path === "apps/server-api/src/index.ts" ||
              path.startsWith("packages/shared/"),
          )
          .sort(),
      };
      assert.deepStrictEqual(artifact, {
        command: `npx stack-effect@latest create ddd-providers --target server/api:${["server-http-api-todos", ...expected.providers].join(",")} --architecture ddd --runtime node --package-manager npm --typescript 6 --monorepo turbo --lint biome --format biome --no-git`,
        selection: [
          ..."workspace/ddd-providers classic workspace-monorepo-turbo workspace-quality-biome-format workspace-quality-biome-lint workspace-test-vitest workspace-typescript-6 server/api ddd server-http-api-todos".split(
            " ",
          ),
          ...[...expected.providers].sort(),
        ],
        blueprint: `
workspace/ddd-providers|classic|.|ddd-providers
server/api|ddd|apps/server-api|server-api
package/shared-domain|ddd|packages/shared/domain|@repo/shared-domain
package/todo-application|ddd|packages/todo/application|@repo/todo-application
package/todo-domain|ddd|packages/todo/domain|@repo/todo-domain
package/todo-infrastructure|ddd|packages/todo/infrastructure|@repo/todo-infrastructure
package/todo-presentation|ddd|packages/todo/presentation|@repo/todo-presentation
`
          .trim()
          .split("\n"),
        paths:
          "apps/server-api/src/index.ts packages/shared/domain/package.json packages/shared/domain/src/index.ts packages/shared/domain/tsconfig.json".split(
            " ",
          ),
      });
      const artifactText = JSON.stringify({
        ...artifact,
        files: preview.files,
        hostPackageName,
      });
      for (const forbidden of "server/todo-api apps/todo-api @repo/todo-api apps/server-todo-api package/db packages/db db-sql package-db @repo/db".split(
        " ",
      ))
        assert.notInclude(artifactText, forbidden);
      assert.deepStrictEqual(
        paths.filter((path) => /(?:^|\/)src\/.*\.test\.ts$/u.test(path)),
        [],
      );
      assert.notInclude(paths, "apps/server-api/src/Api/Health.ts");
      assert.notInclude(paths, "apps/server-api/src/Api/Hello.ts");
      assert.strictEqual(
        preview.files
          .find(({ path }) => path === "packages/shared/domain/src/index.ts")
          ?.contents.trim(),
        "export {};",
      );
      assert.include(paths, "packages/todo/domain/src/api.http.ts");
      assert.include(
        domainApi,
        'import { TodoHttpGroup } from "./todo.http.ts";',
      );
      assert.include(
        domainApi,
        'export const Api = HttpApi.make("Api").add(TodoHttpGroup)',
      );
      assert.strictEqual(domainPackage.exports["./api"], "./src/api.http.ts");
      assert.strictEqual(domainPackage.exports["./http"], "./src/todo.http.ts");
      assert.match(
        host,
        /^import \{ Api \} from "@repo\/todo-domain\/api";$/mu,
      );
      assert.match(
        host,
        /^import \{ TodoGroupLayer \} from "@repo\/todo-presentation\/http";$/mu,
      );
      for (const statement of [
        "const ApiLayer = HttpApiBuilder.layer(Api)",
        "const ApiLive = ApiLayer.pipe(Layer.provide(TodoGroupLayer))",
        "const AllRouters = Layer.mergeAll(ApiLive, HttpApiScalar.layer(Api))",
      ])
        assert.include(host, statement);
      assert.isBelow(
        host.indexOf("HttpApiScalar.layer(Api)"),
        host.indexOf("HttpRouter.serve"),
      );
      assert.strictEqual(
        hostPackage.dependencies["@repo/todo-domain"],
        "workspace:*",
      );
      assert.include(
        presentation,
        'import { Api } from "@repo/todo-domain/api"',
      );
      assert.include(
        presentation,
        "export const TodoGroupLayer = HttpApiBuilder.group(",
      );
      assert.include(
        presentation,
        'Effect.catchTag("TodoRepositoryFailure", unavailable)',
      );
      assert.notMatch(
        presentation,
        /todoHandlers|HttpApi\.make|HttpApiScalar/u,
      );
      assert.notMatch(
        host,
        /TodoHttpGroup|todoHandlers|HttpApi\.make|from "@repo\/domain\/Api";|\b(?:HealthGroupLive|HelloGroupLive|ApiRouter|TodoHttpLive|TodoHttpApi|DatabaseLive|TodoRepositoryLive)\b/u,
      );
      const expectedKeys = new Set<string>(expected.keys);
      const sqlite = expectedKeys.has("sqlite");
      const postgres = expectedKeys.has("postgres");

      assert.deepStrictEqual(repeated, preview);
      baseFiles.forEach((path) => assert.include(paths, path));
      assert.deepStrictEqual(
        paths.filter(
          (path) =>
            path === "data/.gitignore" ||
            /packages\/todo\/infrastructure\/(?:\.env\.|docker-compose|src\/(?:postgres|sqlite|migrations)|test\/sqlite)/u.test(
              path,
            ),
        ),
        [...expected.files].sort(),
      );
      assert.deepStrictEqual(infrastructure.exports, {
        "./memory": "./src/memory.ts",
        ...(sqlite ? { "./sqlite": "./src/sqlite.ts" } : {}),
        ...(postgres ? { "./postgres": "./src/postgres.ts" } : {}),
      });
      assert.deepStrictEqual(infrastructure.dependencies, {
        "@repo/todo-application": "workspace:*",
        "@repo/todo-domain": "workspace:*",
        effect: "^4.0.0-rc.108",
        ...(sqlite ? { "@effect/sql-sqlite-node": "^4.0.0-rc.108" } : {}),
        ...(postgres ? { "@effect/sql-pg": "^4.0.0-rc.108" } : {}),
      });
      assert.deepStrictEqual(
        Array.from(
          host.matchAll(/^\s*(memory|sqlite|postgres): /gmu),
          (match) => match[1],
        ).sort(),
        [...expected.keys].sort(),
      );
      assert.strictEqual(host.includes("TodoSqliteLive"), sqlite);
      assert.strictEqual(host.includes("TodoPostgresLive"), postgres);
      assert.notInclude(paths, "packages/db/package.json");
    }
  }).pipe(Effect.provide(RecipePreviewService.layer)),
);
