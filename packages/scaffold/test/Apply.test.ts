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
import { Apply, ApplyResult } from "@repo/domain/Apply";
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
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import {
  app,
  apply,
  config,
  decideAll,
  exists,
  module,
  nestedStruct,
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
    "should report sorted skipped paths without republishing unchanged composition",
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
        assert.deepStrictEqual(
          result.skipped,
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

  it.effect(
    "should reject a plain Apply intent missing a conflict decision",
    () =>
      Effect.gen(function* () {
        const original = "{}\n";
        yield* writeFiles({ [tsconfig]: original });
        const planned = yield* plan(app("tsconfig"));
        assert.isTrue(planned.conflicts.some(({ path }) => path === tsconfig));
        const applier = yield* Applier;

        const exit = yield* Effect.exit(
          applier.apply({
            apply: { plan: planned, decisions: [] },
            repositoryRoot,
          }),
        );

        assert.strictEqual(exit._tag, "Failure");
        assert.strictEqual(yield* readFile(tsconfig), original);
      }).pipe(Effect.provide(testPipeline)),
  );

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
    ...[
      [
        "a later spread can replace the object field",
        "input: Schema.Number, ...localFields",
      ],
      [
        "a computed key can replace the object field",
        "input: Schema.Number, [localKey]: localValue",
      ],
    ].map(([name, fields]) => ({
      name,
      modules: ["options-field", "pair"],
      path: optionsFile,
      contents: `const Options = Schema.Struct({ ${fields} });\n`,
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

    it.effect(
      "should reuse an existing slot contribution when the catalog adds whitespace around it",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({
            [appFile]:
              'import { Alpha } from "./cards";\nexport const App = () => <main>{/* @slot:components */}<Alpha /></main>;\n',
          });
          yield* planAndApply("alpha-slot", "beta-slot");

          const written = yield* readFile(appFile);
          assert.strictEqual(count(written, /<Alpha \/>/g), 1);
          assert.match(written, /<Alpha \/>\s*<Beta \/>/);
        }).pipe(Effect.provide(testPipeline)),
    );

    it.effect(
      "should reuse padded JSX text before inserting the next contribution",
      () =>
        Effect.gen(function* () {
          yield* writeFiles({
            [appFile]:
              "export const App = () => <main>{/* @slot:components */}  Slot label  </main>;\n",
          });
          yield* planAndApply("alpha-label-slot", "beta-slot");

          const written = yield* readFile(appFile);
          assert.strictEqual(count(written, /Slot label/g), 1);
          assert.match(written, /Slot label\s*<Beta \/>/);
        }).pipe(Effect.provide(testPipeline)),
    );

    it.effect("should apply slot content in a JSX fragment once", () =>
      Effect.gen(function* () {
        yield* writeFiles({
          [appFile]:
            "export const App = () => <>{/* @slot:components */}</>;\n",
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
            if (module === "card-slot") {
              assert.match(
                written,
                /<main>[^]*@slot:components[^]*<Card \/>[^]*<\/main>/,
              );
              assert.match(written, /<aside>\s*<Card \/>\s*<\/aside>/);
            } else {
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
          const generated = yield* readFile(optionsFile);
          assert.include(generated, "Schema.String");
          const unchanged = yield* planAndApply("nested-string-field");
          assert.deepStrictEqual(unchanged.skipped, paths(optionsFile));
          assert.strictEqual(yield* readFile(optionsFile), generated);

          const value = nestedStruct("Schema.String").replaceAll(" })", ", })");
          const edited = `// Keep the local schema formatting.\nconst Options = Schema.Struct({ ...{ "input": ${value} }, ...{ other: Schema.String } });\n`;
          yield* writeFiles({ [optionsFile]: edited });
          const repeated = yield* planAndApply("nested-string-field");

          assert.deepStrictEqual(repeated.skipped, paths(optionsFile));
          assert.strictEqual(yield* readFile(optionsFile), edited);

          const changed = yield* Effect.flip(
            Effect.flatMap(plan(app("nested-number-field")), (planned) =>
              apply(planned),
            ),
          );

          assert.strictEqual(changed._tag, "ApplyError");
          assert.strictEqual(yield* readFile(optionsFile), edited);

          const computed =
            'const Options = Schema.Struct({ ["input"]: Schema.String });\n';
          yield* writeFiles({ [optionsFile]: computed });
          const computedPlan = yield* plan(app("options-field", "pair"));
          const computedFailure = yield* Effect.flip(
            apply(computedPlan, decideAll(computedPlan, "override")),
          );

          assert.strictEqual(computedFailure._tag, "ApplyError");
          assert.strictEqual(yield* readFile(optionsFile), computed);
          assert.isFalse(yield* exists("packages/app/src/a.txt"));
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
              "  Layer.empty,",
              "  McpServer.toolkit(MathToolkit).pipe(Layer.provide(MathToolkitHandlers)),",
              "  Prompts,",
              ");",
              "",
            ].join("\n"),
          });

          yield* planAndApply("math-toolkit", "datetime-toolkit");
          const written = yield* readFile(entryPoint);
          assert.include(written, legacyImport);
          assert.notInclude(written, "Layer.empty");
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
      "should report preflight path changes and an unreadable owner before writing",
      () =>
        Effect.gen(function* () {
          const owner = "packages/existing/package.json";
          const manifestContents = '{"name":"@repo/existing"}';
          yield* writeFiles({ [owner]: manifestContents });
          const planned = yield* plan(app("pair"));
          yield* writeFiles({ "packages/app/src/a.txt": "external content" });

          const fault = yield* withFault({
            method: "readFile",
            path: `${repositoryRoot}/${owner}`,
          });
          const failure = yield* Effect.flip(fault.provide(apply(planned)));

          assert.isTrue(yield* fault.fired);

          assert(failure._tag === "StalePlan");
          for (const path of [
            "packages/app",
            "packages/app/src",
            "packages/app/src/a.txt",
          ]) {
            assert.deepInclude(failure.changes, { path, kind: "created" });
          }
          assert.deepInclude(failure.changes, { path: ".", kind: "modified" });
          assert.strictEqual(yield* readFile(owner), manifestContents);
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

    for (const scenario of [
      "a foreign owner appears",
      "an owner manifest becomes unreadable",
    ]) {
      it.effect(`should stop when ${scenario} during Apply`, () =>
        Effect.gen(function* () {
          const files = yield* FileSystem.FileSystem;
          const owner = "packages/foreign/package.json";
          const pending = "packages/app/src/a.txt";
          const original = "local content\n";
          const writeOwner = ownerManifest("packages/foreign", "@repo/foreign");
          const unreadable =
            scenario === "an owner manifest becomes unreadable";
          yield* writeFiles({ [pending]: original });
          if (unreadable) yield* writeOwner;
          const planned = yield* plan(app("manifest", "pair"));
          const fault = yield* withFault(
            unreadable
              ? {
                  method: "readFile",
                  path: `${repositoryRoot}/${owner}`,
                  when: files.exists(`${repositoryRoot}/${manifest}`),
                }
              : {
                  method: "rename",
                  path: `${repositoryRoot}/${manifest}`,
                  before: writeOwner.pipe(
                    Effect.provideService(FileSystem.FileSystem, files),
                  ),
                },
          );

          const failure = yield* Effect.flip(
            fault.provide(apply(planned, decideAll(planned, "override"))),
          );

          assert.isTrue(yield* fault.fired);
          assert(failure._tag === "StalePlan");
          assert.deepInclude(failure.changes, { path: ".", kind: "modified" });
          assert.deepStrictEqual(
            failure.partialResult,
            new ApplyResult({
              created: paths(manifest),
              modified: [],
              skipped: [],
              failed: [],
            }),
          );
          assert.isTrue(yield* exists(manifest));
          assert.strictEqual(yield* readFile(pending), original);
          assert.isFalse(yield* exists("packages/app/src/b.txt"));
          assert.strictEqual(
            yield* readFile(owner),
            '{"name":"@repo/foreign"}',
          );
        }).pipe(Effect.provide(testPipeline)),
      );
    }

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
          assert.deepStrictEqual(
            failure.partialResult.created,
            paths("packages/app/package.json"),
          );
          assert.deepStrictEqual(failure.partialResult.modified, []);
          assert.isFalse(yield* exists("packages/app/src/b.txt"));
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
        assert.include(previewed.message, "@repo/helper");
        assert.include(applied.message, "@repo/helper");
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

  it.effect("should reject a Plan that adds paths to the seeded baseline", () =>
    Effect.gen(function* () {
      yield* writeFiles({});
      const seeded = yield* plan(app("pair"));
      const expanded = yield* plan(app("pair", "tsconfig"));
      const workspaces = yield* ApplyWorkspaces;
      const workspace = yield* workspaces.fromRepository({
        repositoryRoot,
        baseline: seeded.baseline,
      });

      const failure = yield* Effect.flip(
        workspace.materialize(new Apply({ plan: expanded, decisions: [] })),
      );

      assert.strictEqual(failure._tag, "ApplyError");
      assert.isFalse(yield* exists(tsconfig));
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
});
