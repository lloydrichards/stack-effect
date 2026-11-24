// The ApplyWorkspaces tests construct a Windows Path service from Node's win32 implementation.
// @effect-diagnostics nodeBuiltinImport:off

import nodePath from "node:path";
import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { assert, describe, it, layer } from "@effect/vitest";
import {
  OfficialCatalogLayer,
  officialCatalogLayerWith,
} from "@repo/catalog-official/service";
import { CatalogReader } from "@repo/catalog/Catalog";
import { Apply } from "@repo/domain/Apply";
import {
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { Plan, RepositoryPath } from "@repo/domain/Plan";
import { StackConfig } from "@repo/domain/StackConfig";
import {
  Applier,
  ApplyWorkspaces,
  RecipePreviewer,
} from "@repo/scaffold/Apply";
import { BlueprintResolver } from "@repo/scaffold/Blueprint";
import { Planner } from "@repo/scaffold/Plan";
import { RecipeResolver } from "@repo/scaffold/Recipe";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import {
  app,
  apply,
  config,
  decideAll,
  exists,
  module,
  paths,
  pipelineLayer,
  plan,
  platform,
  preview,
  ProviderCatalogLayer,
  readFile,
  repositoryRoot,
  selected,
  selection,
  target,
  TestCatalogLayer,
  testPipeline,
  withFault,
  writeFiles,
} from "./fixtures/scaffold";

describe("Applier", () => {
  const tsconfig = "packages/app/tsconfig.json";
  const manifest = "packages/app/package.json";
  const appFile = "packages/app/src/App.tsx";
  const optionsFile = "packages/app/src/Options.ts";
  const decodeJson = Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Json),
  );

  /** Plans and applies a selection, failing on any conflict or failed write. */
  const planAndApply = (...modules: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const planned = yield* plan(app(...modules));
      assert.deepStrictEqual(planned.conflicts, []);
      const result = yield* apply(planned);
      assert.deepStrictEqual(result.failed, []);
      return result;
    });

  const count = (contents: string, pattern: RegExp) =>
    contents.match(pattern)?.length ?? 0;

  const entryPoint = "packages/app/src/index.ts";

  /** Toolkit modules that import from package subpath exports, as the official MCP catalog does. */
  const toolkitModule = (name: string) =>
    module(`${name.toLowerCase()}-toolkit`, "package", {
      contributions: [
        {
          _tag: "ts-call-arg",
          path: "{{targetPath}}/src/index.ts",
          targetVariable: "McpCapabilities",
          functionName: "Layer.mergeAll",
          argument: `McpServer.toolkit(${name}Toolkit).pipe(Layer.provide(${name}ToolkitHandlers))`,
          import: {
            moduleSpecifier: `@repo/ai/${name}Toolkit`,
            namedImports: [`${name}Toolkit`, `${name}ToolkitHandlers`],
          },
        },
      ],
    });

  const toolkitPipeline = pipelineLayer(
    CatalogReader.fromFragments([
      {
        targets: [target("package")],
        modules: [toolkitModule("Math"), toolkitModule("DateTime")],
      },
    ]),
  );

  /** Local names bound by each import clause, in file order. */
  const importedNames = (contents: string) =>
    Array.from(contents.matchAll(/import\s*\{([^}]*)\}\s*from/g)).flatMap(
      ([, names = ""]) =>
        names
          .split(",")
          .map(
            (name) =>
              name
                .trim()
                .split(/\s+as\s+/)
                .at(-1) ?? "",
          )
          .filter((name) => name !== ""),
    );

  it.effect("should write every created file and report its path", () =>
    Effect.gen(function* () {
      yield* writeFiles({});
      const result = yield* apply(yield* plan(app("api", "pair")));

      assert.deepStrictEqual(
        result.created,
        paths(
          "packages/app/src/Api.ts",
          "packages/app/src/a.txt",
          "packages/app/src/b.txt",
        ),
      );
      assert.deepStrictEqual(result.failed, []);
      assert.strictEqual(yield* readFile("packages/app/src/b.txt"), "B\n");
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect("should write a package.json entry named __proto__", () =>
    Effect.gen(function* () {
      yield* writeFiles({ [manifest]: '{ "name": "@repo/app" }\n' });
      yield* planAndApply("proto-script");

      const { scripts } = JSON.parse(yield* readFile(manifest));

      assert.isTrue(Object.hasOwn(scripts, "__proto__"));
      assert.strictEqual(scripts["__proto__"], "node proto.js");
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect("should skip every path when the repository already matches", () =>
    Effect.gen(function* () {
      yield* writeFiles({});
      yield* apply(yield* plan(app("api")));

      const result = yield* apply(yield* plan(app("api")));

      assert.deepStrictEqual(result.created, []);
      assert.deepStrictEqual(result.modified, []);
      assert.deepStrictEqual(result.skipped, paths("packages/app/src/Api.ts"));
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should skip publication when composition produces the same bytes",
    () =>
      Effect.gen(function* () {
        const formatted =
          '{\n  "name": "@repo/app",\n  "scripts": {\n    "dev": "vite"\n  }\n}\n';
        yield* writeFiles({
          [manifest]: formatted,
          "packages/app/src/a.txt": "A\n",
          "packages/app/src/b.txt": "B\n",
        });
        const planned = yield* plan(app("manifest", "pair"));
        assert.strictEqual(
          planned.outcomes.find((outcome) => outcome.path === manifest)
            ?.classification,
          "modify",
        );

        const deniedPublication = yield* withFault({
          method: "rename",
          path: `${repositoryRoot}/${manifest}`,
        });
        const result = yield* deniedPublication.provide(apply(planned));

        assert.deepStrictEqual(result.failed, []);
        assert.deepStrictEqual(result.modified, []);
        assert.sameMembers(
          [...result.skipped],
          paths(manifest, "packages/app/src/a.txt", "packages/app/src/b.txt"),
        );
        assert.strictEqual(yield* readFile(manifest), formatted);
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should compose changes onto the existing manifest and preserve user fields",
    () =>
      Effect.gen(function* () {
        const existing =
          '{"name":"@repo/app","private":true,"scripts":{"build":"vite build"}}';
        yield* writeFiles({ [manifest]: existing });
        const planned = yield* plan(app("manifest"));

        const result = yield* apply(planned);

        assert.deepStrictEqual(result.failed, []);
        assert.deepStrictEqual(result.modified, paths(manifest));
        assert.deepStrictEqual(decodeJson(yield* readFile(manifest)), {
          name: "@repo/app",
          private: true,
          scripts: { build: "vite build", dev: "vite" },
        });
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should create a root manifest from a composition with no existing file or seed",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({});
        const planned = yield* plan(
          selection(selected("workspace", "project", "root-scripts")),
        );

        const result = yield* apply(planned);

        assert.deepStrictEqual(result.failed, []);
        assert.include(result.created, RepositoryPath.make("package.json"));
        assert.deepStrictEqual(decodeJson(yield* readFile("package.json")), {
          scripts: { dev: "vite" },
        });
      }).pipe(Effect.provide(testPipeline)),
  );

  for (const { decision, contents, status } of [
    { decision: "skip", contents: "{}\n", status: "skipped" },
    {
      decision: "override",
      contents: '{ "extends": "../../tsconfig.base.json" }\n',
      status: "modified",
    },
  ] as const) {
    it.effect(`should honor a ${decision} decision for a conflict`, () =>
      Effect.gen(function* () {
        yield* writeFiles({ [tsconfig]: "{}\n" });
        const planned = yield* plan(app("tsconfig"));

        const result = yield* apply(planned, decideAll(planned, decision));

        assert.deepStrictEqual(result[status], paths(tsconfig));
        assert.strictEqual(yield* readFile(tsconfig), contents);
      }).pipe(Effect.provide(testPipeline)),
    );
  }

  for (const { name, modules, path, contents, identifier } of [
    {
      name: "a call target is missing",
      modules: ["command", "pair"],
      path: "packages/app/src/main.ts",
      contents: "export const x = 1;\n",
      identifier: "Command.withSubcommands",
    },
    {
      name: "a JSX slot marker is missing",
      modules: ["card-slot", "pair"],
      path: appFile,
      contents: "export const App = () => <main />;\n",
      identifier: "@slot:components",
    },
    ...['"input"', '["input"]'].map((key) => ({
      name: `object field ${key} already has a different value`,
      modules: ["options-field", "pair"],
      path: optionsFile,
      contents: `const Options = Schema.Struct({ ${key}: Schema.String });\n`,
      identifier: "Options.input",
    })),
    {
      name: "a manifest section is not an object",
      modules: ["scripts", "pair"],
      path: manifest,
      contents: '{"name":"@repo/app","scripts":"vite dev"}',
      identifier: '"scripts"',
    },
  ]) {
    it.effect(`should fail before writing when ${name}`, () =>
      Effect.gen(function* () {
        yield* writeFiles({ [path]: contents });
        const planned = yield* plan(app(...modules));

        const failure = yield* Effect.flip(
          apply(planned, decideAll(planned, "override")),
        );

        assert.strictEqual(failure._tag, "ApplyError");
        assert.include(failure.message, identifier);
        assert.strictEqual(yield* readFile(path), contents);
        assert.isFalse(yield* exists("packages/app/src/a.txt"));
      }).pipe(Effect.provide(testPipeline)),
    );
  }

  it.effect(
    "should fail before writing when a file to compose cannot be read",
    () =>
      Effect.gen(function* () {
        const existing =
          "export const App = () => <>\n{/* @slot:components */}\n</>;\n";
        yield* writeFiles({ [appFile]: existing });
        const planned = yield* plan(app("api", "card-slot"));
        // The first read checks the slot file against the Plan baseline.
        const fault = yield* withFault({
          method: "readFile",
          path: `${repositoryRoot}/${appFile}`,
          skip: 1,
        });

        const failure = yield* Effect.flip(fault.provide(apply(planned)));

        assert.isTrue(yield* fault.fired);
        assert.strictEqual(failure._tag, "ApplyError");
        assert.include(failure.message, appFile);
        assert.isFalse(yield* exists("packages/app/src/Api.ts"));
        assert.strictEqual(yield* readFile(appFile), existing);
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should record a failed write and continue below a newly created directory",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({});
        const planned = yield* plan(app("pair"));
        const fault = yield* withFault({
          method: "rename",
          path: `${repositoryRoot}/packages/app/src/a.txt`,
        });

        const result = yield* fault.provide(apply(planned));

        assert.isTrue(yield* fault.fired);
        assert.deepStrictEqual(result.created, paths("packages/app/src/b.txt"));
        assert.deepStrictEqual(
          result.failed.map((entry) => entry.path),
          ["packages/app/src/a.txt"],
        );
        assert.isTrue(
          result.failed[0]?.causes.some((cause) =>
            cause.includes("injected fault"),
          ),
        );
        assert.isFalse(yield* exists("packages/app/src/a.txt"));
        assert.strictEqual(yield* readFile("packages/app/src/b.txt"), "B\n");
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should continue publishing files after failing to publish a new owner manifest",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({});
        const planned = yield* plan(app("manifest", "pair"));
        const fault = yield* withFault({
          method: "rename",
          path: `${repositoryRoot}/${manifest}`,
        });

        const result = yield* fault.provide(apply(planned));

        assert.deepStrictEqual(
          result.failed.map(({ path }) => path),
          [manifest],
        );
        assert.deepStrictEqual(
          result.created,
          paths("packages/app/src/a.txt", "packages/app/src/b.txt"),
        );
        assert.isFalse(yield* exists(manifest));
        assert.strictEqual(yield* readFile("packages/app/src/a.txt"), "A\n");
        const files = yield* FileSystem.FileSystem;
        assert.sameMembers(
          yield* files.readDirectory(`${repositoryRoot}/packages/app`),
          ["src"],
        );
      }).pipe(Effect.provide(testPipeline)),
  );

  describe("when composing TypeScript", () => {
    it.effect(
      "should keep slot contributions in order and apply them once",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({
            [appFile]:
              "export const App = () => (\n  <main>\n    {/* @slot:components */}\n  </main>\n);\n",
          });
          yield* planAndApply("alpha-slot", "beta-slot");
          const once = yield* readFile(appFile);

          const repeated = yield* planAndApply("alpha-slot", "beta-slot");

          assert.isBelow(once.indexOf("<Alpha />"), once.indexOf("<Beta />"));
          assert.deepStrictEqual(repeated.skipped, paths(appFile));
          const twice = yield* readFile(appFile);
          assert.strictEqual(twice, once);
          assert.strictEqual(count(twice, /<Alpha \/>/g), 1);
          assert.strictEqual(count(twice, /<Beta \/>/g), 1);
          assert.strictEqual(count(twice, /from "\.\/cards"/g), 1);
        }).pipe(Effect.provide(testPipeline)),
    );

    it.effect("should apply slot content in a JSX fragment once", () =>
      Effect.gen(function* () {
        yield* writeFiles({
          [appFile]:
            "export const App = () => (\n  <>\n    {/* @slot:components */}\n  </>\n);\n",
        });
        yield* planAndApply("card-slot");
        const once = yield* readFile(appFile);

        yield* planAndApply("card-slot");

        assert.strictEqual(yield* readFile(appFile), once);
        assert.strictEqual(count(once, /<Card \/>/g), 1);
      }).pipe(Effect.provide(testPipeline)),
    );

    for (const { name, module, existing } of [
      {
        name: "outside the slot",
        module: "card-slot",
        existing:
          "export const App = () => (\n  <>\n    <main>\n      {/* @slot:components */}\n    </main>\n    <aside><Card /></aside>\n  </>\n);\n",
      },
      {
        name: "after the next sibling slot",
        module: "first-card-slot",
        existing:
          "export const App = () => (\n  <main>\n    {/* @slot:first */}\n    {/* @slot:second */}\n    <Card />\n  </main>\n);\n",
      },
    ]) {
      it.effect(
        `should insert slot content when matching content is ${name}`,
        () =>
          Effect.gen(function* () {
            yield* writeFiles({ [appFile]: existing });
            yield* planAndApply(module);

            const written = yield* readFile(appFile);
            assert.strictEqual(count(written, /<Card \/>/g), 2);
            assert.isBelow(
              written.indexOf("<Card />"),
              written.lastIndexOf("<Card />"),
            );
            if (module === "first-card-slot") {
              assert.isBelow(
                written.indexOf("<Card />"),
                written.indexOf("{/* @slot:second */}"),
              );
            }
          }).pipe(Effect.provide(testPipeline)),
      );
    }

    it.effect(
      "should repeat a deeply nested object field and reject a change within it",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({
            [optionsFile]: "const Options = Schema.Struct({});\n",
          });
          yield* planAndApply("nested-string-field");
          const once = yield* readFile(optionsFile);

          const repeated = yield* planAndApply("nested-string-field");
          const changed = yield* Effect.flip(
            Effect.flatMap(plan(app("nested-number-field")), (planned) =>
              apply(planned),
            ),
          );

          assert.deepStrictEqual(repeated.skipped, paths(optionsFile));
          assert.strictEqual(changed._tag, "ApplyError");
          assert.include(changed.message, "Options.input");
          assert.strictEqual(yield* readFile(optionsFile), once);
        }).pipe(Effect.provide(testPipeline)),
    );

    it.effect(
      "should keep one binding per name when an older entry point imports it from another specifier",
      () =>
        Effect.gen(function* () {
          const legacyImport =
            'import { MathToolkit, MathToolkitHandlers, Prompts } from "@repo/ai";';
          yield* writeFiles({
            [entryPoint]: [
              legacyImport,
              'import { Layer } from "effect";',
              "",
              "const McpCapabilities = Layer.mergeAll(",
              "  McpServer.toolkit(MathToolkit).pipe(Layer.provide(MathToolkitHandlers)),",
              "  Prompts,",
              ");",
              "",
            ].join("\n"),
          });

          yield* planAndApply("math-toolkit", "datetime-toolkit");
          const written = yield* readFile(entryPoint);
          assert.include(written, legacyImport);
          assert.notInclude(written, '"@repo/ai/MathToolkit"');
          assert.deepStrictEqual(importedNames(written).toSorted(), [
            "DateTimeToolkit",
            "DateTimeToolkitHandlers",
            "Layer",
            "MathToolkit",
            "MathToolkitHandlers",
            "Prompts",
          ]);
          assert.strictEqual(
            count(written, /McpServer\.toolkit\(MathToolkit\)/g),
            1,
          );
          assert.strictEqual(
            count(written, /McpServer\.toolkit\(DateTimeToolkit\)/g),
            1,
          );
        }).pipe(Effect.provide(toolkitPipeline)),
    );
  });

  describe("repository state", () => {
    const officialLayer = pipelineLayer(OfficialCatalogLayer);

    const domain = selection(
      selected("package", "domain", "domain-api-contracts"),
    );
    const build = plan(domain);

    const packages = (...names: ReadonlyArray<string>) =>
      selection(...names.map((name) => selected("package", name)));

    const ownerManifest = (directory: string, name: string) =>
      writeFiles({ [`${directory}/package.json`]: JSON.stringify({ name }) });

    const decodeRecord = Schema.decodeUnknownEffect(
      Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
    );

    for (const runtime of [
      { _tag: "deno" },
      { _tag: "node", packageManager: "pnpm" },
    ] as const) {
      it.effect(
        `should preserve ${runtime._tag} workspace settings when nested packages are added incrementally`,
        () =>
          Effect.gen(function* () {
            yield* ownerManifest("packages/helper", "@repo/helper");
            yield* writeFiles({
              "packages/helper/templates/workspace/package.json": "{}",
              "package.json":
                '{"name":"project","workspaces":["apps/**","packages/**","tools/*"],"scripts":{"custom":"echo custom"}}',
              "deno.json":
                '{"workspace":["apps/**","packages/**"],"tasks":{"custom":"echo custom"}}',
              "pnpm-workspace.yaml":
                'packages:\n  - "apps/**"\n  - "packages/**"\n\nallowBuilds:\n  esbuild: true\n',
            });
            const configuration = new StackConfig({
              name: "project",
              runtime,
            });
            const planAt = (name: string) =>
              plan(
                selection(
                  selected("workspace", configuration.name),
                  selected("package", name),
                ),
                { config: configuration },
              );
            for (const name of ["sdk/client", "sdk/codecs"]) {
              const planned = yield* planAt(name);
              assert.deepStrictEqual(
                planned.conflicts.map((conflict) => conflict.path),
                name === "sdk/client" ? [] : ["README.md"],
              );
              const result = yield* apply(planned, decideAll(planned, "skip"));
              assert.deepStrictEqual(result.failed, []);
            }
            const members = [
              "packages/config-typescript",
              "packages/helper",
              "packages/sdk/client",
              "packages/sdk/codecs",
            ];
            const rootManifest = yield* decodeRecord(
              yield* readFile("package.json"),
            );
            assert.deepStrictEqual(rootManifest["workspaces"], [
              ...members,
              "tools/*",
            ]);
            assert.deepStrictEqual(rootManifest["scripts"], {
              custom: "echo custom",
            });
            const denoManifest = yield* decodeRecord(
              yield* readFile("deno.json"),
            );
            assert.deepStrictEqual(denoManifest["workspace"], members);
            assert.deepStrictEqual(denoManifest["tasks"], {
              custom: "echo custom",
            });
            const pnpm = yield* readFile("pnpm-workspace.yaml");
            assert.strictEqual(
              pnpm,
              `packages:\n${members.map((member) => `  - ${member}\n`).join("")}\nallowBuilds:\n  esbuild: true\n`,
            );

            const withUserComment = pnpm.replace(
              "  - packages/helper\n",
              "  - packages/helper # maintained separately\n",
            );
            yield* writeFiles({ "pnpm-workspace.yaml": withUserComment });
            const repeated = yield* planAt("sdk/codecs");
            const result = yield* apply(repeated, decideAll(repeated, "skip"));

            assert.deepStrictEqual(result.failed, []);
            assert.strictEqual(
              yield* readFile("pnpm-workspace.yaml"),
              withUserComment,
            );
            assert.include(
              yield* readFile("deno.json"),
              '"custom": "echo custom"',
            );
            assert.deepStrictEqual(
              repeated.outcomes
                .filter(
                  ({ path, classification }) =>
                    (path === "package.json" || path === "deno.json") &&
                    classification !== "unchanged",
                )
                .map(({ path, classification }) => ({ path, classification })),
              [],
            );
            assert.strictEqual(
              repeated.outcomes.find(
                (outcome) => outcome.path === "pnpm-workspace.yaml",
              )?.classification,
              "unchanged",
            );
          }).pipe(Effect.provide(officialLayer)),
      );
    }

    for (const [label, path, contents] of [
      [
        "invalid YAML with a packages sequence",
        "pnpm-workspace.yaml",
        "packages: []\npackages: []\n",
      ],
      [
        "a non-sequence packages field",
        "pnpm-workspace.yaml",
        "packages: packages/*\n",
      ],
      ["invalid JSON", "package.json", '{"workspaces": [}'],
      [
        "a non-array workspace field",
        "deno.json",
        '{"workspace":"packages/*"}',
      ],
    ] as const) {
      it.effect(`should reject ${label} in ${path}`, () =>
        Effect.gen(function* () {
          yield* writeFiles({ [path]: contents });

          const failure = yield* Effect.flip(plan(app("pair")));

          assert.strictEqual(failure._tag, "PlanError");
          assert.isDefined(failure.cause);
          assert.strictEqual(yield* readFile(path), contents);
        }).pipe(Effect.provide(testPipeline)),
      );
    }

    for (const [directory, name] of [
      ["packages/domain", "@repo/other"],
      ["packages/domain/client", "@repo/client"],
      ["packages/other", "@repo/domain"],
      ["packages/Domain", "@repo/other"],
      ["packages", "@repo/sdk"],
    ] as const) {
      it.effect(
        `should reject placement without writes when ${directory} belongs to ${name}`,
        () =>
          Effect.gen(function* () {
            yield* ownerManifest(directory, name);

            const failure = yield* Effect.flip(build);

            assert.strictEqual(failure._tag, "PlanError");
            assert.include(failure.message, directory);
            assert.isFalse(yield* exists("packages/domain/src/Api.ts"));
          }).pipe(Effect.provide(officialLayer)),
      );
    }

    for (const symbolic of [false, true]) {
      it.effect(
        `should reject discovery when a grouping directory has ${symbolic ? "a symbolic link" : "a malformed manifest"}`,
        () =>
          Effect.gen(function* () {
            const files = yield* FileSystem.FileSystem;
            if (symbolic) {
              yield* files.makeDirectory(`${repositoryRoot}/packages`, {
                recursive: true,
              });
              yield* files.symlink(
                "/missing-group",
                `${repositoryRoot}/packages/sdk`,
              );
            } else {
              yield* writeFiles({
                "packages/sdk/package.json": "invalid json",
              });
            }

            const failure = yield* Effect.flip(build);

            assert.strictEqual(failure._tag, "PlanError");
          }).pipe(Effect.provide(officialLayer)),
      );
    }

    it.effect(
      "should ignore owner manifests in hidden and dependency grouping directories",
      () =>
        Effect.gen(function* () {
          yield* ownerManifest("packages/.generated/domain", "@repo/domain");
          yield* ownerManifest("packages/Node_Modules/domain", "@repo/domain");

          const planned = yield* build;
          const result = yield* apply(planned);

          assert.deepStrictEqual(planned.baseline.packageOwners, []);
          assert.deepStrictEqual(result.failed, []);
          assert.include(
            result.created,
            RepositoryPath.make("packages/domain/package.json"),
          );
        }).pipe(Effect.provide(officialLayer)),
    );

    it.effect(
      "should reject an owner manifest with a case-mismatched filename",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const grouping = `${repositoryRoot}/packages/helper`;
          yield* ownerManifest("packages/helper", "@repo/helper");
          yield* build;
          yield* fs.rename(
            `${grouping}/package.json`,
            `${grouping}/Package.json`,
          );

          const failure = yield* Effect.flip(build);

          assert.strictEqual(failure._tag, "PlanError");
          assert.isFalse(yield* exists("packages/domain/package.json"));
        }).pipe(Effect.provide(officialLayer)),
    );

    it.effect(
      "should treat the workspace root name independently of an application owner name",
      () =>
        Effect.gen(function* () {
          const stackConfig = new StackConfig({
            name: "server-api",
            runtime: { _tag: "bun" },
          });
          yield* ownerManifest("apps/server-api", "server-api");

          const planned = yield* plan(
            selection(selected("workspace", stackConfig.name)),
            { config: stackConfig },
          );

          assert.deepStrictEqual(planned.baseline.packageOwners, [
            {
              path: RepositoryPath.make("apps/server-api"),
              name: "server-api",
            },
          ]);
        }).pipe(Effect.provide(officialLayer)),
    );

    it.effect(
      "should preserve existing files when sdk/client aliases sdk-client",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({});
          yield* apply(yield* plan(packages("sdk-client")));
          const original = yield* readFile("packages/sdk-client/package.json");

          const failure = yield* Effect.flip(plan(packages("sdk/client")));

          assert.strictEqual(failure._tag, "PlanError");
          assert.strictEqual(
            yield* readFile("packages/sdk-client/package.json"),
            original,
          );
          assert.isFalse(yield* exists("packages/sdk/client/src/index.ts"));
        }).pipe(Effect.provide(officialLayer)),
    );

    it.effect(
      "should complete later writes when a new owner contains an internal template manifest",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({});

          const result = yield* apply(
            yield* plan(app("manifest", "template-manifest", "pair")),
          );

          assert.deepStrictEqual(result.failed, []);
          assert.strictEqual(yield* readFile("packages/app/src/b.txt"), "B\n");
        }).pipe(Effect.provide(testPipeline)),
    );

    it.effect(
      "should ignore internal manifests and symlinks when adding beside an existing owner",
      () =>
        Effect.gen(function* () {
          const files = yield* FileSystem.FileSystem;
          yield* ownerManifest("packages/helper", "@repo/helper");
          yield* ownerManifest("packages/helper/dist", "@repo/helper");
          yield* writeFiles({
            "packages/helper/tests/fixtures/package.json": "{}",
          });
          yield* files.symlink(
            "/missing-source",
            `${repositoryRoot}/packages/helper/source-link`,
          );

          const planned = yield* build;
          const result = yield* apply(planned);

          assert.deepStrictEqual(planned.baseline.packageOwners, [
            {
              path: RepositoryPath.make("packages/helper"),
              name: "@repo/helper",
            },
          ]);
          assert.deepStrictEqual(result.failed, []);
          assert.include(
            result.created,
            RepositoryPath.make("packages/domain/package.json"),
          );
        }).pipe(Effect.provide(officialLayer)),
    );

    for (const change of ["removed", "renamed", "discovered"] as const) {
      it.effect(
        `should reject Apply when a helper owner is ${change} after planning`,
        () =>
          Effect.gen(function* () {
            const files = yield* FileSystem.FileSystem;
            const discovered = change === "discovered";
            yield* ownerManifest(
              discovered ? "packages/unrelated" : "packages/helper",
              discovered ? "@repo/unrelated" : "@repo/helper",
            );
            const planned = yield* build;
            yield* change === "removed"
              ? files.remove(`${repositoryRoot}/packages/helper/package.json`)
              : ownerManifest(
                  "packages/helper",
                  discovered ? "@repo/helper" : "@repo/changed",
                );

            const failure = yield* Effect.flip(apply(planned));

            assert(failure._tag === "StalePlan");
            assert.deepStrictEqual(failure.partialResult.created, []);
          }).pipe(Effect.provide(officialLayer)),
      );
    }

    it.effect("should plan and apply beneath a missing repository root", () =>
      Effect.gen(function* () {
        const root = "/future/repo";
        const planned = yield* plan(app("pair"), { repositoryRoot: root });
        assert.strictEqual(planned.baseline.root, root);

        const previewed = yield* preview(planned, [], root);
        assert.isAbove(previewed.files.length, 0);
        assert.isFalse(yield* exists(".", root));

        const result = yield* apply(planned, [], root);
        assert.isAbove(result.created.length, 0);
        assert.isTrue(yield* exists(".", root));
      }).pipe(Effect.provide(testPipeline)),
    );

    it.effect("should accept an alias that resolves to the planned root", () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* writeFiles({});
        yield* files.symlink(repositoryRoot, "/alias");
        const planned = yield* plan(app("pair"));

        const result = yield* preview(planned, [], "/alias");

        assert.deepStrictEqual(result.apply.failed, []);
      }).pipe(Effect.provide(testPipeline)),
    );

    for (const [label, bytes] of [
      ["a NUL in otherwise valid UTF-8", Uint8Array.of(0x41, 0x00)],
      ["invalid UTF-8 without NUL", Uint8Array.of(0xff)],
    ] as const) {
      it.effect(`should reject a planned text file containing ${label}`, () =>
        Effect.gen(function* () {
          const files = yield* FileSystem.FileSystem;
          yield* writeFiles({ "packages/app/src/.keep": "" });
          yield* files.writeFile(
            `${repositoryRoot}/packages/app/src/a.txt`,
            bytes,
          );

          const failure = yield* Effect.flip(plan(app("pair")));

          assert.strictEqual(failure._tag, "PlanError");
        }).pipe(Effect.provide(testPipeline)),
      );
    }

    it.effect("should reject a symbolic link at a planned path", () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* writeFiles({ "packages/app/src/.keep": "" });
        yield* files.writeFileString("/external.txt", "external");
        yield* files.symlink(
          "/external.txt",
          `${repositoryRoot}/packages/app/src/a.txt`,
        );

        const failure = yield* Effect.flip(plan(app("pair")));

        assert.strictEqual(failure._tag, "PlanError");
        assert.include(failure.message, "packages/app/src/a.txt");
      }).pipe(Effect.provide(testPipeline)),
    );

    it.effect(
      "should reject a newly created planned path before preview or Apply",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({});
          const planned = yield* plan(app("pair"));
          yield* writeFiles({
            "packages/app/src/a.txt": "private new content",
          });

          const previewFailure = yield* Effect.flip(preview(planned));
          const applyFailure = yield* Effect.flip(apply(planned));

          assert(previewFailure._tag === "StalePlan");
          assert.deepInclude(previewFailure.changes, {
            path: "packages/app/src/a.txt",
            kind: "created",
          });
          assert.notInclude(previewFailure.message, "private new content");
          assert(applyFailure._tag === "StalePlan");
          assert.deepStrictEqual(applyFailure.partialResult.created, []);
          assert.strictEqual(
            yield* readFile("packages/app/src/a.txt"),
            "private new content",
          );
        }).pipe(Effect.provide(testPipeline)),
    );

    it.effect(
      "should reject a different repository even when planned paths match",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({});
          yield* writeFiles({}, "/other");
          const planned = yield* plan(app("pair"));

          const failure = yield* Effect.flip(preview(planned, [], "/other"));

          assert(failure._tag === "StalePlan");
          assert.deepInclude(failure.changes, {
            path: ".",
            kind: "rootChanged",
          });
        }).pipe(Effect.provide(testPipeline)),
    );

    it.effect("should make a Plan stale after its first successful Apply", () =>
      Effect.gen(function* () {
        yield* writeFiles({});
        const planned = yield* plan(app("pair"));
        const first = yield* apply(planned);
        assert.isAbove(first.created.length, 0);

        const second = yield* Effect.flip(apply(planned));

        assert(second._tag === "StalePlan");
        assert.deepStrictEqual(second.partialResult.created, []);
      }).pipe(Effect.provide(testPipeline)),
    );

    for (const { name, change, kind } of [
      {
        name: "changed contents",
        change: (original: string) => `private changed ${original}`,
        kind: "modified",
      },
      {
        name: "an added byte order mark",
        change: (original: string) => `﻿${original}`,
        kind: "modified",
      },
    ] as const) {
      it.effect(
        `should detect ${name} in an unchanged file and accept it once restored`,
        () =>
          Effect.gen(function* () {
            yield* writeFiles({});
            yield* apply(yield* plan(app("pair")));
            const planned = yield* plan(app("pair"));
            const path = "packages/app/src/a.txt";
            const original = yield* readFile(path);
            yield* writeFiles({ [path]: change(original) });

            const failure = yield* Effect.flip(preview(planned));
            yield* writeFiles({ [path]: original });
            const restored = yield* preview(planned);

            assert(failure._tag === "StalePlan");
            assert.deepInclude(failure.changes, {
              path: RepositoryPath.make(path),
              kind,
            });
            assert.notInclude(failure.message, "private changed");
            assert.deepStrictEqual(restored.apply.failed, []);
          }).pipe(Effect.provide(testPipeline)),
      );
    }

    it.effect("should reject deletion of an existing planned file", () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* writeFiles({});
        yield* apply(yield* plan(app("pair")));
        const planned = yield* plan(app("pair"));
        yield* files.remove(`${repositoryRoot}/packages/app/src/a.txt`);

        const failure = yield* Effect.flip(preview(planned));

        assert(failure._tag === "StalePlan");
        assert.deepInclude(failure.changes, {
          path: "packages/app/src/a.txt",
          kind: "deleted",
        });
      }).pipe(Effect.provide(testPipeline)),
    );

    it.effect(
      "should report an unreadable planned file as a stale type change",
      () =>
        Effect.gen(function* () {
          const path = RepositoryPath.make("packages/app/src/a.txt");
          yield* writeFiles({ [path]: "A\n" });
          const planned = yield* plan(app("pair"));
          const fault = yield* withFault({
            method: "readFile",
            path: `${repositoryRoot}/${path}`,
          });

          const failure = yield* Effect.flip(fault.provide(apply(planned)));

          assert(failure._tag === "StalePlan");
          assert.deepStrictEqual(failure.changes, [
            { path, kind: "typeChanged" },
          ]);
          assert.deepStrictEqual(failure.partialResult.created, []);
          assert.isFalse(yield* exists("packages/app/src/b.txt"));
          assert.strictEqual(yield* readFile(path), "A\n");
        }).pipe(Effect.provide(testPipeline)),
    );

    it.effect(
      "should report a directory replacing a planned file as a stale type change",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = RepositoryPath.make("packages/app/src/a.txt");
          const absolutePath = `${repositoryRoot}/${path}`;
          yield* writeFiles({ [path]: "A\n" });
          const planned = yield* plan(app("pair"));
          yield* fs.remove(absolutePath);
          yield* fs.makeDirectory(absolutePath);

          const failure = yield* Effect.flip(apply(planned));

          assert(failure._tag === "StalePlan");
          assert.deepStrictEqual(failure.changes, [
            { path, kind: "typeChanged" },
          ]);
          assert.deepStrictEqual(failure.partialResult.created, []);
          assert.isFalse(yield* exists("packages/app/src/b.txt"));
        }).pipe(Effect.provide(testPipeline)),
    );

    it.effect(
      "should report every preflight change, including an ancestor, before writing",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({});
          const planned = yield* plan(app("pair"));
          yield* writeFiles({ "packages/app/src/a.txt": "external content" });

          const failure = yield* Effect.flip(apply(planned));

          assert(failure._tag === "StalePlan");
          for (const path of [
            "packages",
            "packages/app",
            "packages/app/src",
            "packages/app/src/a.txt",
          ]) {
            assert.deepInclude(failure.changes, { path, kind: "created" });
          }
          assert.deepStrictEqual(failure.partialResult.created, []);
          assert.deepStrictEqual(failure.partialResult.modified, []);
          assert.strictEqual(
            yield* readFile("packages/app/src/a.txt"),
            "external content",
          );
          assert.isFalse(yield* exists("packages/app/src/b.txt"));
        }).pipe(Effect.provide(testPipeline)),
    );

    it.effect("should treat a changed skipped conflict as a stale Plan", () =>
      Effect.gen(function* () {
        const tsconfig = "packages/app/tsconfig.json";
        yield* writeFiles({ [tsconfig]: "{}\n" });
        const planned = yield* plan(app("tsconfig", "pair"));
        yield* writeFiles({ [tsconfig]: '{"changed":true}\n' });

        const failure = yield* Effect.flip(
          apply(planned, decideAll(planned, "skip")),
        );

        assert(failure._tag === "StalePlan");
        assert.deepInclude(failure.changes, {
          path: tsconfig,
          kind: "modified",
        });
        assert.deepStrictEqual(failure.partialResult.created, []);
        assert.strictEqual(yield* readFile(tsconfig), '{"changed":true}\n');
      }).pipe(Effect.provide(testPipeline)),
    );

    it.effect("should stop when a foreign owner appears during Apply", () =>
      Effect.gen(function* () {
        const files = yield* FileSystem.FileSystem;
        yield* writeFiles({});
        const planned = yield* plan(app("manifest", "pair"));
        const fault = yield* withFault({
          method: "rename",
          path: `${repositoryRoot}/packages/app/package.json`,
          before: ownerManifest("packages/foreign", "@repo/foreign").pipe(
            Effect.provideService(FileSystem.FileSystem, files),
          ),
        });

        const failure = yield* Effect.flip(fault.provide(apply(planned)));

        assert.isTrue(yield* fault.fired);
        assert(failure._tag === "StalePlan");
        assert.deepInclude(failure.changes, { path: ".", kind: "modified" });
        assert.deepStrictEqual(
          failure.partialResult.created,
          paths("packages/app/package.json"),
        );
        assert.isFalse(yield* exists("packages/app/src/a.txt"));
        assert.strictEqual(
          yield* readFile("packages/foreign/package.json"),
          '{"name":"@repo/foreign"}',
        );
      }).pipe(Effect.provide(testPipeline)),
    );

    it.effect(
      "should stop with a partial result when a later path changes during Apply",
      () =>
        Effect.gen(function* () {
          const files = yield* FileSystem.FileSystem;
          yield* writeFiles({});
          const planned = yield* plan(app("manifest", "pair"));
          const fault = yield* withFault({
            method: "rename",
            path: `${repositoryRoot}/packages/app/package.json`,
            before: writeFiles({
              "packages/app/src/a.txt": "external late drift",
            }).pipe(Effect.provideService(FileSystem.FileSystem, files)),
          });

          const failure = yield* Effect.flip(fault.provide(apply(planned)));

          assert.isTrue(yield* fault.fired);
          assert(failure._tag === "StalePlan");
          assert.deepInclude(failure.changes, {
            path: "packages/app/src/a.txt",
            kind: "created",
          });
          assert.include(
            failure.partialResult.created,
            RepositoryPath.make("packages/app/package.json"),
          );
          assert.notInclude(
            failure.partialResult.created,
            RepositoryPath.make("packages/app/src/a.txt"),
          );
          assert.strictEqual(
            yield* readFile("packages/app/src/a.txt"),
            "external late drift",
          );
        }).pipe(Effect.provide(testPipeline)),
    );
  });
});

describe("ApplyWorkspaces", () => {
  const decodeJson = Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Json),
  );

  const manifest = "packages/app/package.json";

  // Writes a manifest whose name differs from the target's package name, so only Apply sees the owner collision.
  const foreignNamePipeline = pipelineLayer(
    CatalogReader.fromFragments([
      {
        targets: [target("package")],
        modules: [
          module("helper-manifest", "package", {
            contributions: [
              {
                _tag: "file",
                path: "{{targetPath}}/package.json",
                contents: '{ "name": "@repo/helper" }\n',
              },
            ],
          }),
        ],
      },
    ]),
  );
  const tsconfig = "packages/app/tsconfig.json";

  it.effect(
    "should preview an incremental Apply without touching the host repository",
    () =>
      Effect.gen(function* () {
        const original = '{"name":"@repo/app","private":true}';
        yield* writeFiles({
          [manifest]: original,
          [tsconfig]: "{}\n",
          "packages/app/notes.txt": "user notes",
        });
        const planned = yield* plan(app("scripts", "tsconfig", "pair"));

        const result = yield* preview(planned, decideAll(planned, "skip"));

        assert.deepStrictEqual(
          result.apply.created,
          paths("packages/app/src/a.txt", "packages/app/src/b.txt"),
        );
        assert.deepStrictEqual(result.apply.modified, paths(manifest));
        assert.deepStrictEqual(result.apply.skipped, paths(tsconfig));
        assert.deepStrictEqual(result.apply.failed, []);
        assert.deepStrictEqual(
          result.files.map((file) => [file.path, file.status]),
          [
            [manifest, "modified"],
            ["packages/app/src/a.txt", "created"],
            ["packages/app/src/b.txt", "created"],
          ],
        );
        assert.deepStrictEqual(decodeJson(result.files[0]?.contents), {
          name: "@repo/app",
          private: true,
          scripts: { dev: "vite" },
        });
        assert.strictEqual(yield* readFile(manifest), original);
        assert.strictEqual(yield* readFile(tsconfig), "{}\n");
        assert.strictEqual(
          yield* readFile("packages/app/notes.txt"),
          "user notes",
        );
        assert.isFalse(yield* exists("packages/app/src"));
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should reject an owner collision outside the Plan baseline like host Apply",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({
          "packages/helper/package.json": '{"name":"@repo/helper"}',
        });
        const planned = yield* plan(app("helper-manifest"));
        assert.isFalse(
          planned.baseline.paths.some(
            (entry) => entry.path === "packages/helper/package.json",
          ),
        );

        const previewed = yield* Effect.flip(preview(planned));
        const applied = yield* Effect.flip(apply(planned));

        assert.strictEqual(previewed._tag, "ApplyError");
        assert.strictEqual(applied._tag, "ApplyError");
        assert.strictEqual(previewed.message, applied.message);
        assert.isFalse(yield* exists(manifest));
      }).pipe(Effect.provide(foreignNamePipeline)),
  );

  it.effect(
    "should preserve an established owner when a manifest override would rename it",
    () =>
      Effect.gen(function* () {
        const original = '{"name":"@repo/app"}';
        yield* writeFiles({ [manifest]: original });
        const planned = yield* plan(app("helper-manifest"));
        const decisions = decideAll(planned, "override");

        const previewed = yield* Effect.flip(preview(planned, decisions));
        const applied = yield* Effect.flip(apply(planned, decisions));

        assert.strictEqual(previewed._tag, "ApplyError");
        assert.strictEqual(applied._tag, "ApplyError");
        assert.strictEqual(yield* readFile(manifest), original);
      }).pipe(Effect.provide(foreignNamePipeline)),
  );

  it.effect("should seed byte-order-marked files with their exact bytes", () =>
    Effect.gen(function* () {
      const original = "\uFEFFA\n";
      yield* writeFiles({ "packages/app/src/a.txt": original });
      const planned = yield* plan(app("pair"));

      const result = yield* preview(planned, decideAll(planned, "skip"));

      assert.deepStrictEqual(
        result.apply.created,
        paths("packages/app/src/b.txt"),
      );
      const files = yield* FileSystem.FileSystem;
      assert.deepStrictEqual(
        yield* files.readFile(`${repositoryRoot}/packages/app/src/a.txt`),
        new TextEncoder().encode(original),
      );
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect("should use POSIX paths when the host uses Windows", () =>
    Effect.gen(function* () {
      const hostFileSystem = yield* MemoryFileSystem.make.pipe(
        Effect.provide(BrowserCrypto.layer),
      );
      const posixPath = yield* Path.Path.pipe(Effect.provide(Path.layer));
      const windowsPath = Path.Path.of({
        ...posixPath,
        sep: "\\",
        basename: nodePath.win32.basename,
        dirname: nodePath.win32.dirname,
        extname: nodePath.win32.extname,
        format: nodePath.win32.format,
        isAbsolute: nodePath.win32.isAbsolute,
        join: nodePath.win32.join,
        normalize: nodePath.win32.normalize,
        parse: nodePath.win32.parse,
        relative: nodePath.win32.relative,
        resolve: nodePath.win32.resolve,
        toNamespacedPath: nodePath.win32.toNamespacedPath,
      });
      const hostLayer = Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, hostFileSystem),
        Layer.succeed(Path.Path, windowsPath),
        BrowserCrypto.layer,
        TestCatalogLayer,
      );
      const windowsRoot = "C:\\repo";
      // Root files only: the memory host cannot create Windows directories.
      const original = '{"name":"windows-app"}';
      const hostManifest = nodePath.win32.join(windowsRoot, "package.json");
      yield* hostFileSystem.writeFileString(hostManifest, original);

      const result = yield* Effect.gen(function* () {
        const planned = yield* plan(
          selection(selected("workspace", "windows-app", "root-scripts")),
          {
            repositoryRoot: windowsRoot,
          },
        );
        return yield* preview(planned, [], windowsRoot);
      }).pipe(
        Effect.provide(
          Layer.provideMerge(
            Layer.mergeAll(
              BlueprintResolver.layer,
              Planner.layer,
              ApplyWorkspaces.layer,
            ),
            hostLayer,
          ),
        ),
      );

      assert.deepStrictEqual(result.apply.failed, []);
      assert.deepStrictEqual(result.apply.modified, paths("package.json"));
      assert.deepStrictEqual(
        decodeJson(
          result.files.find((file) => file.path === "package.json")?.contents,
        ),
        {
          name: "windows-app",
          scripts: { dev: "vite" },
        },
      );
      assert.strictEqual(
        yield* hostFileSystem.readFileString(hostManifest),
        original,
      );
    }),
  );

  it.effect("should recheck the host repository before materializing", () =>
    Effect.gen(function* () {
      yield* writeFiles({});
      const planned = yield* plan(app("pair"));
      const workspaces = yield* ApplyWorkspaces;
      const workspace = yield* workspaces.fromRepository({
        repositoryRoot,
        baseline: planned.baseline,
      });
      yield* writeFiles({ "packages/app/src/a.txt": "user content" });

      const failure = yield* Effect.flip(
        workspace.materialize(new Apply({ plan: planned, decisions: [] })),
      );

      assert(failure._tag === "StalePlan");
      assert.deepInclude(failure.changes, {
        path: "packages/app/src/a.txt",
        kind: "created",
      });
      assert.strictEqual(
        yield* readFile("packages/app/src/a.txt"),
        "user content",
      );
    }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should reject a host Plan with a different baseline even when it is current",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({});
        const seeded = yield* plan(app("pair"));
        const other = yield* plan(app("tsconfig"));
        const workspaces = yield* ApplyWorkspaces;
        const workspace = yield* workspaces.fromRepository({
          repositoryRoot,
          baseline: seeded.baseline,
        });

        const failure = yield* Effect.flip(
          workspace.materialize(new Apply({ plan: other, decisions: [] })),
        );

        assert.strictEqual(failure._tag, "ApplyError");
        assert.isFalse(yield* exists(tsconfig));
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should reject an equally sized baseline captured for different paths",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({});
        const build = (name: string) =>
          plan(selection(selected("package", name, "pair")));
        const seeded = yield* build("first");
        const other = yield* build("second");
        const workspaces = yield* ApplyWorkspaces;
        const workspace = yield* workspaces.fromRepository({
          repositoryRoot,
          baseline: seeded.baseline,
        });

        const failure = yield* Effect.flip(
          workspace.materialize(new Apply({ plan: other, decisions: [] })),
        );

        assert.strictEqual(failure._tag, "ApplyError");
        assert.isFalse(yield* exists("packages/second/src/a.txt"));
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should still preview and apply a Plan without an ownership inventory",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({ [manifest]: '{"name":"@repo/app"}' });
        const planned = yield* plan(app("scripts", "pair"));
        const legacyPlan = new Plan({
          outcomes: planned.outcomes,
          conflicts: planned.conflicts,
          baseline: {
            root: planned.baseline.root,
            paths: planned.baseline.paths,
          },
        });

        const previewed = yield* preview(legacyPlan);
        const applied = yield* apply(legacyPlan);

        assert.deepStrictEqual(previewed.apply, applied);
        assert.deepStrictEqual(applied.failed, []);
        assert.deepStrictEqual(
          applied.created,
          paths("packages/app/src/a.txt", "packages/app/src/b.txt"),
        );
        assert.deepStrictEqual(applied.modified, paths(manifest));
        assert.deepStrictEqual(decodeJson(yield* readFile(manifest)), {
          name: "@repo/app",
          scripts: { dev: "vite" },
        });
      }).pipe(Effect.provide(testPipeline)),
  );

  it.effect(
    "should materialize a Plan built in a seeded workspace without writing to the host",
    () =>
      Effect.gen(function* () {
        yield* writeFiles({});
        const seeded = yield* plan(app("pair"));
        const workspaces = yield* ApplyWorkspaces;
        const blueprints = yield* BlueprintResolver;
        const workspace = yield* workspaces.fromRepository({
          repositoryRoot,
          baseline: seeded.baseline,
        });

        const planned = yield* workspace.plan({
          blueprint: yield* blueprints.resolve(app("pair"), config),
          config,
        });
        const result = yield* workspace.materialize(
          new Apply({ plan: planned, decisions: [] }),
        );

        assert.notStrictEqual(planned.baseline.root, repositoryRoot);
        assert.deepStrictEqual(result.apply.failed, []);
        assert.deepStrictEqual(
          result.files.map((file) => file.contents),
          ["A\n", "B\n"],
        );
        assert.isFalse(yield* exists("packages/app"));
      }).pipe(Effect.provide(testPipeline)),
  );
});

describe("RecipePreviewer", () => {
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

  it.effect(
    "should plan and preview a module when it is supplied outside the built-in registry",
    () => {
      const extra: ModuleDefinition = {
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
        const previews = yield* RecipePreviewer;
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
          fileAt(preview)("packages/extra/extra.txt"),
          "from fragment\n",
        );
      }).pipe(
        Effect.provide(
          RecipePreviewer.layer.pipe(
            Layer.provide(platform),
            Layer.provide(catalogLayer),
          ),
        ),
      );
    },
  );

  it.effect(
    "should include the provided StackConfig among files sorted by path",
    () =>
      Effect.gen(function* () {
        const previews = yield* RecipePreviewer;
        const input = new StackConfig({
          name: "preview-configuration",
          runtime: { _tag: "node", packageManager: "pnpm" },
          typescript: "7",
        });
        const result = yield* previews.preview({
          config: input,
          recipe: { targets: [] },
        });

        const configuration = result.files.find(
          ({ path }) => path === "stack.effect.json",
        );
        assert.isDefined(configuration);
        assert.strictEqual(configuration.status, "created");
        const decoded = yield* Schema.decodeEffect(
          Schema.fromJsonString(StackConfig),
        )(configuration.contents);
        assert.deepStrictEqual(decoded, input);
        const filePaths = result.files.map(({ path }) => path);
        assert.deepStrictEqual(filePaths, [...filePaths].sort());
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "should surface ambiguous providers for the preview caller to choose",
    () =>
      Effect.gen(function* () {
        const previews = yield* RecipePreviewer;
        const failure = yield* Effect.flip(
          previews.preview({
            config,
            recipe: {
              targets: [
                {
                  target: new TargetIdentity({
                    kind: TargetKind.make("package"),
                    name: "db",
                  }),
                  modules: [ModuleId.make("todo-repository")],
                },
              ],
            },
          }),
        );

        assert(failure._tag === "AmbiguousRecipeProvider");
        assert.strictEqual(failure.requestingModuleId, "todo-repository");
        assert.strictEqual(failure.target.toKey(), "packages/db");
        assert.strictEqual(failure.capability, "db-sql");
        assert.sameMembers(
          failure.providers.map(({ moduleId }) => moduleId),
          ["sql-sqlite", "sql-postgres"],
        );
      }).pipe(
        Effect.provide(
          RecipePreviewer.layer.pipe(
            Layer.provide(platform),
            Layer.provide(ProviderCatalogLayer),
          ),
        ),
      ),
  );

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
        }).pipe(Effect.provide(previewLayer)),
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
        }).pipe(
          Effect.provide(
            Layer.provideMerge(
              RecipeResolver.layer,
              pipelineLayer(OfficialCatalogLayer),
            ),
          ),
        ),
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

    it.effect(
      "keeps a conflicted file when the apply intent skipped its checks",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const recipes = yield* RecipeResolver;
          const blueprints = yield* BlueprintResolver;
          const plans = yield* Planner;
          const applies = yield* Applier;
          const resolve = (targets: ReadonlyArray<ReturnType<typeof target>>) =>
            recipes
              .resolve(
                { targets },
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
          // A valid intent passes as a plain object too.
          const initial: Apply = {
            plan: yield* resolve([target("server", "api", "server-http-api")]),
            decisions: [],
          };
          yield* applies.apply({ apply: initial, repositoryRoot: "/repo" });
          const edited = "# Our API\n\nCustom operations guide.\n";
          yield* fs.writeFileString("/repo/README.md", edited);
          const plan = yield* resolve([
            target("server", "api", "server-http-api-todos"),
            target("package", "db", "package-db-sqlite"),
          ]);
          assert.isTrue(
            plan.conflicts.some((conflict) => conflict.path === "README.md"),
          );

          const unchecked: Apply = { plan, decisions: [] };
          const exit = yield* Effect.exit(
            applies.apply({ apply: unchecked, repositoryRoot: "/repo" }),
          );

          assert.isTrue(exit._tag === "Failure");
          assert.strictEqual(
            yield* fs.readFileString("/repo/README.md"),
            edited,
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
      }).pipe(
        Effect.provide(
          RecipePreviewer.layer.pipe(
            Layer.provide(platform),
            Layer.provide(OfficialCatalogLayer),
          ),
        ),
      );

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
            result.files.some(
              (file) => file.path === `apps/${kind}-app/alchemy.ts`,
            ),
          );
          assert.isFalse(
            result.files.some(
              (file) =>
                file.path.includes("cloudflare-worker") ||
                file.path.startsWith("apps/server-"),
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
            result.files.some((file) => file.path.startsWith("apps/client-")),
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
            result.files.find(
              (file) => file.path === "apps/cloudflare-worker-app/alchemy.ts",
            )?.contents ?? "",
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
            result.files.some((file) =>
              file.path.startsWith("apps/cloudflare-worker-"),
            ),
          );
          assert.isTrue(
            result.files.some(
              (file) => file.path === "packages/domain/src/Api.ts",
            ),
          );
          assert.isFalse(
            result.files.some(
              (file) =>
                file.path.startsWith("apps/server-") ||
                file.path === "alchemy.run.ts",
            ),
          );
          assert.isTrue(
            result.files.some((file) =>
              file.path.endsWith("/src/features/rest.ts"),
            ),
          );
        }),
    );

    it.effect(
      "the CAFE module generates a connected Foldkit Website and API Worker",
      () =>
        Effect.gen(function* () {
          const result = yield* preview("workspace", [
            "workspace-alchemy-cafe",
          ]);
          const stack =
            result.files.find(({ path }) => path === "alchemy.run.ts")
              ?.contents ?? "";
          const paths = result.files.map(({ path }) => path);
          assert.includeMembers(paths, [
            "apps/client-foldkit-web/alchemy.ts",
            "apps/client-foldkit-web/src/features/rest.ts",
            "apps/cloudflare-worker-api/alchemy.ts",
            "apps/cloudflare-worker-api/src/Api.ts",
            "packages/domain/src/Api.ts",
            "packages/config-typescript/vite.json",
          ]);
          assert.include(stack, '"./apps/client-foldkit-web/alchemy"');
          assert.include(stack, '"./apps/cloudflare-worker-api/alchemy"');
          assert.include(
            stack,
            "Website({ VITE_SERVER_URL: api.url.as<string>() })",
          );
          assert.include(stack, "return { api: api.url, web: web.url }");
        }),
    );
  });
});
