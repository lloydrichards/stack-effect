import { NodeServices } from "@effect/platform-node";
import { assert, describe, it, layer } from "@effect/vitest";
import {
  buildCatalog,
  type CatalogInput,
  defineModules,
  defineTargets,
  type ModuleInput,
  templates,
} from "@repo/authoring";
import { Effect, FileSystem, Path, Schema } from "effect";
import { catalog, root } from "../test/fixtures/standalone/catalog";
import { acmeTargets } from "../test/fixtures/standalone/targets";

const packageRoot = new URL("../", import.meta.url);
const goldenUrl = new URL(
  "../test/fixtures/standalone/golden/catalog.json",
  import.meta.url,
);
const template = templates(new URL("../test/fixtures/", import.meta.url));

const standaloneModule: ModuleInput = {
  id: "acme-extra",
  title: "Extra",
  description: "An extra module",
  supportedOn: [{ _tag: "kind", kind: "workspace" }],
  dependencies: [],
  contributions: [{ _tag: "file", path: "extra.txt", contents: "extra\n" }],
};

const withModule = (module: ModuleInput): CatalogInput => ({
  targets: catalog.targets,
  modules: [...catalog.modules, defineModules(import.meta.url, [module])],
});

it.effect(
  "publishes exact package placement and its required capability without changing flat output",
  () =>
    Effect.gen(function* () {
      const input: CatalogInput = {
        targets: [
          defineTargets(import.meta.url, [
            {
              kind: "package",
              title: "Package",
              description: "Package",
              contributions: [],
            },
          ]),
        ],
        modules: [
          defineModules(import.meta.url, [
            {
              id: "sdk-client-placement",
              title: "Placement",
              description: "Placement",
              supportedOn: [
                {
                  _tag: "identity",
                  identity: { kind: "package", name: "sdk-client" },
                },
              ],
              targetPath: "packages/sdk/client",
              dependencies: [],
              contributions: [],
            },
          ]),
        ],
      };
      const result = yield* buildCatalog(input, {
        catalogId: "acme",
        root: packageRoot,
      });
      assert.strictEqual(
        result.document.modules[0]?.targetPath,
        "packages/sdk/client",
      );
      assert.include(result.document.requiredCapabilities, "target:path");
    }).pipe(Effect.provide(NodeServices.layer)),
);

const buildError = (input: CatalogInput) =>
  Effect.flip(buildCatalog(input, { catalogId: "acme", root: packageRoot }));

const buildFailure = (input: CatalogInput) =>
  buildError(input).pipe(Effect.map((error) => error.issues));

const withUnknownToken = withModule({
  ...standaloneModule,
  contributions: [
    {
      _tag: "file",
      path: "clean.ts",
      contents: template("./standalone/templates/app/src/greeting.ts"),
    },
    {
      _tag: "file",
      path: "unknown.txt",
      contents: template("./invalid/unknown-token.txt"),
    },
  ],
});

const untyped = Schema.decodeEffect(Schema.fromJsonString(Schema.Any));

/**
 * A catalog in a temporary directory with a symlink out of it and an alias to
 * it, for checking that locations are compared after resolving symlinks.
 */
const symlinkedCatalog = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const temp = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
  const catalogDir = path.join(temp, "catalog");
  yield* fs.makeDirectory(path.join(temp, "outside"), { recursive: true });
  yield* fs.makeDirectory(catalogDir, { recursive: true });
  yield* fs.writeFileString(path.join(temp, "outside", "o.txt"), "out\n");
  yield* fs.writeFileString(path.join(catalogDir, "..dots.txt"), "in\n");
  yield* fs.symlink(path.join(temp, "outside"), path.join(catalogDir, "link"));
  yield* fs.symlink(catalogDir, path.join(temp, "alias"));
  const source = (yield* path.toFileUrl(path.join(catalogDir, "defs.ts"))).href;
  const local = templates(yield* path.toFileUrl(`${catalogDir}/`));
  const build = (templatePath: string, root: string) =>
    buildCatalog(
      {
        targets: [
          defineTargets(source, [
            {
              kind: "workspace",
              title: "Workspace",
              description: "Root",
              contributions: [],
            },
          ]),
        ],
        modules: [
          defineModules(source, [
            {
              ...standaloneModule,
              contributions: [
                { _tag: "file", path: "x.txt", contents: local(templatePath) },
              ],
            },
          ]),
        ],
      },
      { catalogId: "acme", root },
    );
  return { build, catalogDir, alias: path.join(temp, "alias") };
});

layer(NodeServices.layer)("buildCatalog", (it) => {
  it.effect(
    "should match the golden v1 document byte for byte when the standalone fixture is built twice",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const first = yield* buildCatalog(catalog, { catalogId: "acme", root });
        const second = yield* buildCatalog(catalog, {
          catalogId: "acme",
          root,
        });
        const golden = yield* fs.readFileString(
          yield* (yield* Path.Path).fromFileUrl(goldenUrl),
        );

        assert.strictEqual(first.json, golden);
        assert.strictEqual(second.json, first.json);
      }),
  );

  it.effect(
    "should embed template bytes exactly when a template has a BOM or no final newline",
    () =>
      Effect.gen(function* () {
        const { document } = yield* buildCatalog(catalog, {
          catalogId: "acme",
          root,
        });
        const contents = [...document.targets, ...document.modules]
          .flatMap((definition) => definition.contributions)
          .flatMap((contribution) =>
            contribution._tag === "file"
              ? [[contribution.path, contribution.contents] as const]
              : [],
          );
        const byPath = new Map(contents);
        assert.isTrue(byPath.get("{{targetPath}}/src/main.ts")?.startsWith("﻿"));
        assert.isFalse(byPath.get("README.md")?.endsWith("\n"));
      }),
  );

  it.effect(
    "should return provenance beside the document when definitions use templates",
    () =>
      Effect.gen(function* () {
        const { json, provenance } = yield* buildCatalog(catalog, {
          catalogId: "acme",
          root,
        });
        assert.deepStrictEqual(provenance, [
          {
            subject: { _tag: "target", kind: "workspace" },
            source: "targets.ts",
            templates: [
              {
                contribution: 0,
                field: "contents",
                contributionPath: "package.json",
                template: "templates/workspace/package.json",
              },
            ],
          },
          {
            subject: { _tag: "target", kind: "app" },
            source: "targets.ts",
            templates: [
              {
                contribution: 0,
                field: "contents",
                contributionPath: "{{targetPath}}/src/main.ts",
                template: "templates/app/src/main.ts",
              },
            ],
          },
          {
            subject: { _tag: "module", id: "acme-workspace-readme" },
            source: "modules.ts",
            templates: [
              {
                contribution: 0,
                field: "contents",
                contributionPath: "README.md",
                template: "templates/workspace/README.md",
              },
            ],
          },
          {
            subject: { _tag: "module", id: "acme-app-greeting" },
            source: "modules.ts",
            templates: [
              {
                contribution: 0,
                field: "contents",
                contributionPath: "{{targetPath}}/src/greeting.ts",
                template: "templates/app/src/greeting.ts",
              },
            ],
          },
        ]);
        assert.notInclude(json, "templates/");
        assert.notInclude(json, "modules.ts");
      }),
  );

  it.effect(
    "should name the definition and source when a module references a missing module",
    () =>
      Effect.gen(function* () {
        const issues = yield* buildFailure(
          withModule({
            ...standaloneModule,
            dependencies: [
              {
                _tag: "required-module",
                target: { kind: "workspace", name: "" },
                moduleId: "acme-missing",
              },
            ],
          }),
        );
        assert.deepStrictEqual(issues, [
          {
            subject: { _tag: "module", id: "acme-extra" },
            code: "missing-reference",
            message: "Module acme-extra references missing module acme-missing",
            sources: ["src/buildCatalog.test.ts"],
          },
        ]);
      }),
  );

  it.effect(
    "should name only the templates that use it when a module uses an unknown token",
    () =>
      Effect.gen(function* () {
        const issues = yield* buildFailure(withUnknownToken);
        assert.deepStrictEqual(issues, [
          {
            subject: { _tag: "module", id: "acme-extra" },
            code: "unsupported-capability",
            message:
              "Module acme-extra uses unsupported capability token:acmeToken",
            sources: ["src/buildCatalog.test.ts"],
            template: "test/fixtures/invalid/unknown-token.txt",
          },
        ]);
      }),
  );

  it.effect(
    "should publish Finalize scripts only when finalizeScripts is allow",
    () =>
      Effect.gen(function* () {
        const input = withModule({
          ...standaloneModule,
          scripts: [{ label: "Install", command: "bun install" }],
        });
        const issues = yield* buildFailure(input);
        assert.deepStrictEqual(issues, [
          {
            subject: { _tag: "module", id: "acme-extra" },
            code: "finalize-script",
            message:
              'Module acme-extra declares Finalize scripts; pass finalizeScripts: "allow" to publish them',
            sources: ["src/buildCatalog.test.ts"],
          },
        ]);
        const allowed = yield* buildCatalog(input, {
          catalogId: "acme",
          root: packageRoot,
          finalizeScripts: "allow",
        });
        assert.strictEqual(allowed.document.modules.at(-1)?.scripts?.length, 1);
      }),
  );

  it.effect(
    "should report every missing template before checking references when templates are missing",
    () =>
      Effect.gen(function* () {
        const issues = yield* buildFailure(
          withModule({
            ...standaloneModule,
            dependencies: [
              {
                _tag: "required-module",
                target: { kind: "workspace", name: "" },
                moduleId: "acme-missing",
              },
            ],
            contributions: [
              {
                _tag: "file",
                path: "a.txt",
                contents: template("./invalid/missing-a.txt"),
              },
              {
                _tag: "file",
                path: "b.txt",
                contents: template("./invalid/missing-b.txt"),
              },
            ],
          }),
        );
        assert.deepStrictEqual(
          issues.map(({ code, sources, template }) => ({
            code,
            sources,
            template,
          })),
          [
            {
              code: "missing-template",
              sources: ["src/buildCatalog.test.ts"],
              template: "test/fixtures/invalid/missing-a.txt",
            },
            {
              code: "missing-template",
              sources: ["src/buildCatalog.test.ts"],
              template: "test/fixtures/invalid/missing-b.txt",
            },
          ],
        );
      }),
  );

  it.effect(
    "should report an invalid shape for the target when a target has a field outside v1",
    () =>
      Effect.gen(function* () {
        const acmeApp = acmeTargets.definitions[1];
        assert.isDefined(acmeApp);
        const target = { ...acmeApp, kind: "acme-extra-target", extra: true };
        const issues = yield* buildFailure({
          targets: [
            ...catalog.targets,
            defineTargets(import.meta.url, [target]),
          ],
          modules: catalog.modules,
        });
        assert.deepStrictEqual(
          issues.map(({ subject, code, sources }) => ({
            subject,
            code,
            sources,
          })),
          [
            {
              subject: { _tag: "target", kind: "acme-extra-target" },
              code: "invalid-shape",
              sources: ["src/buildCatalog.test.ts"],
            },
          ],
        );
      }),
  );

  it.effect.each([
    {
      condition: "a module has no id",
      definitions: '[{"title":"No id"}]',
      subject: "(unnamed module 1 in src/buildCatalog.test.ts)",
    },
    {
      condition: "a module has no contributions",
      definitions:
        '[{"id":"acme-bare","title":"t","description":"d","supportedOn":[],"dependencies":[]}]',
      subject: "acme-bare",
    },
    {
      condition: "a module has a null contribution",
      definitions:
        '[{"id":"acme-null","title":"t","description":"d","supportedOn":[],"dependencies":[],"contributions":[null]}]',
      subject: "acme-null",
    },
    {
      condition: "a module is null",
      definitions: "[null]",
      subject: "(unnamed module 1 in src/buildCatalog.test.ts)",
    },
    {
      condition: "the definitions are an object instead of an array",
      definitions: "{}",
      subject: "(unnamed module 1 in src/buildCatalog.test.ts)",
    },
  ])(
    "should report an invalid shape instead of crashing when $condition",
    ({ definitions, subject }) =>
      Effect.gen(function* () {
        const issues = yield* buildFailure({
          targets: catalog.targets,
          modules: [
            defineModules(import.meta.url, yield* untyped(definitions)),
          ],
        });
        assert.deepStrictEqual(
          issues.map(({ subject, code, sources }) => ({
            subject,
            code,
            sources,
          })),
          [
            {
              subject: { _tag: "module", id: subject },
              code: "invalid-shape",
              sources: ["src/buildCatalog.test.ts"],
            },
          ],
        );
      }),
  );

  it.effect("should reject the root when it is a relative path", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        buildCatalog(catalog, { catalogId: "acme", root: "./relative/" }),
      );
      assert.deepStrictEqual(
        error.issues.map(({ code, message }) => ({ code, message })),
        [
          {
            code: "invalid-options",
            message: "root ./relative/ is not a file URL or absolute path",
          },
        ],
      );
    }),
  );

  it.effect("should reject the root when it does not exist", () =>
    Effect.gen(function* () {
      const missing = new URL("./does-not-exist/", packageRoot);
      const error = yield* Effect.flip(
        buildCatalog(catalog, { catalogId: "acme", root: missing }),
      );
      assert.deepStrictEqual(
        error.issues.map(({ code, message }) => ({ code, message })),
        [
          {
            code: "invalid-options",
            message: `root ${missing.href} is not an existing directory`,
          },
        ],
      );
    }),
  );

  it.effect(
    "should reject a definition source when it is not a file URL or absolute path",
    () =>
      Effect.gen(function* () {
        const issues = yield* buildFailure({
          targets: catalog.targets,
          modules: [
            { source: "hand-written.ts", definitions: [standaloneModule] },
          ],
        });
        assert.deepStrictEqual(
          issues.map(({ code, message }) => ({ code, message })),
          [
            {
              code: "invalid-options",
              message:
                "Definition source hand-written.ts is not a file URL or absolute path",
            },
          ],
        );
      }),
  );

  it.effect(
    "should reject a definition source when it is outside the catalog root",
    () =>
      Effect.gen(function* () {
        const issues = yield* buildFailure({
          targets: catalog.targets,
          modules: [
            defineModules("file:///elsewhere/a.ts", [standaloneModule]),
          ],
        });
        assert.deepStrictEqual(
          issues.map(({ code, message }) => ({ code, message })),
          [
            {
              code: "invalid-options",
              message:
                "Definition source file:///elsewhere/a.ts is outside the catalog root",
            },
          ],
        );
      }),
  );

  it.effect(
    "should build the same output when the root is an absolute path instead of a file URL",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fromPath = yield* buildCatalog(catalog, {
          catalogId: "acme",
          root: yield* path.fromFileUrl(root),
        });
        const fromUrl = yield* buildCatalog(catalog, {
          catalogId: "acme",
          root,
        });
        assert.strictEqual(fromPath.json, fromUrl.json);
        assert.deepStrictEqual(fromPath.provenance, fromUrl.provenance);
      }),
  );

  it.effect(
    "should reject templates when they are not readable UTF-8 files in root",
    () =>
      Effect.gen(function* () {
        const issues = yield* buildFailure(
          withModule({
            ...standaloneModule,
            contributions: [
              {
                _tag: "file",
                path: "utf8.txt",
                contents: template("./invalid/invalid-utf8.txt"),
              },
              {
                _tag: "file",
                path: "dir.txt",
                contents: template("./invalid/a-directory"),
              },
              {
                _tag: "file",
                path: "outside.txt",
                contents: { _tag: "TemplateRef", url: "file:///elsewhere.txt" },
              },
            ],
          }),
        );
        assert.deepStrictEqual(
          issues.map(({ code, message, template }) => ({
            code,
            message,
            template,
          })),
          [
            {
              code: "invalid-template",
              message:
                "Module acme-extra contribution 0 contents template is not valid UTF-8",
              template: "test/fixtures/invalid/invalid-utf8.txt",
            },
            {
              code: "invalid-template",
              message:
                "Module acme-extra contribution 1 contents template is not a file",
              template: "test/fixtures/invalid/a-directory",
            },
            {
              code: "invalid-template",
              message:
                "Module acme-extra contribution 2 contents template is outside the catalog root",
              template: "file:///elsewhere.txt",
            },
          ],
        );
      }),
  );

  it.effect(
    "should report an unknown token inline and in its template when both use it",
    () =>
      Effect.gen(function* () {
        const issues = yield* buildFailure(
          withModule({
            ...standaloneModule,
            contributions: [
              {
                _tag: "file",
                path: "{{acmeToken}}.txt",
                contents: template("./invalid/unknown-token.txt"),
              },
            ],
          }),
        );
        assert.deepStrictEqual(
          issues.map((issue) => issue.template),
          [undefined, "test/fixtures/invalid/unknown-token.txt"],
        );
      }),
  );

  it.effect(
    "should report every shape error in one issue when a definition has several",
    () =>
      Effect.gen(function* () {
        const definition = yield* untyped(
          '{"id":"acme-shapes","title":1,"description":2,"supportedOn":[],"dependencies":[],"contributions":[],"junk":true}',
        );
        const issues = yield* buildFailure({
          targets: catalog.targets,
          modules: [defineModules(import.meta.url, [definition])],
        });
        assert.lengthOf(issues, 1);
        for (const key of ["title", "description", "junk"])
          assert.include(issues[0]?.message, `["${key}"]`);
      }),
  );

  it.effect(
    "should record provenance when a barrel export path comes from a template",
    () =>
      Effect.gen(function* () {
        const { provenance } = yield* buildCatalog(
          withModule({
            ...standaloneModule,
            contributions: [
              {
                _tag: "barrel-export",
                barrelPath: "{{targetPath}}/src/index.ts",
                exportPath: template("./templates/barrel-export.txt"),
              },
            ],
          }),
          { catalogId: "acme", root: packageRoot },
        );
        assert.deepStrictEqual(provenance.at(-1)?.templates, [
          {
            contribution: 0,
            field: "exportPath",
            contributionPath: "{{targetPath}}/src/index.ts",
            template: "test/fixtures/templates/barrel-export.txt",
          },
        ]);
      }),
  );

  it.effect(
    "should reject a template when a symlink resolves it outside the root",
    () =>
      Effect.gen(function* () {
        const { build, catalogDir } = yield* symlinkedCatalog;
        const error = yield* Effect.flip(build("./link/o.txt", catalogDir));
        assert.deepStrictEqual(
          error.issues.map(({ code, message }) => ({ code, message })),
          [
            {
              code: "invalid-template",
              message:
                "Module acme-extra contribution 0 contents template is outside the catalog root",
            },
          ],
        );
      }),
  );

  it.effect(
    "should accept a template inside the root when its name starts with two dots",
    () =>
      Effect.gen(function* () {
        const { build, catalogDir } = yield* symlinkedCatalog;
        const dotted = yield* build("./..dots.txt", catalogDir);
        assert.strictEqual(
          dotted.provenance.at(-1)?.templates[0]?.template,
          "..dots.txt",
        );
      }),
  );

  it.effect(
    "should build the same output when the root is reached through a symlink",
    () =>
      Effect.gen(function* () {
        const { alias, build, catalogDir } = yield* symlinkedCatalog;
        const direct = yield* build("./..dots.txt", catalogDir);
        const aliased = yield* build("./..dots.txt", alias);
        assert.strictEqual(aliased.json, direct.json);
        assert.deepStrictEqual(aliased.provenance, direct.provenance);
      }),
  );

  it.effect("should reject the options when catalogId is empty", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        buildCatalog(withModule(standaloneModule), {
          catalogId: "",
          root: packageRoot,
        }),
      );
      assert.deepStrictEqual(error.issues, [
        {
          subject: { _tag: "document" },
          code: "invalid-options",
          message: "catalogId must be a non-empty string",
          sources: [],
        },
      ]);
      assert.strictEqual(
        error.message,
        "Catalog build failed:\n  catalogId must be a non-empty string",
      );
    }),
  );

  it.effect(
    "should prefix each issue with its sources and template when the error is formatted",
    () =>
      Effect.gen(function* () {
        const unknownToken = yield* buildError(withUnknownToken);
        assert.strictEqual(
          unknownToken.message,
          "Catalog build failed:\n  src/buildCatalog.test.ts template test/fixtures/invalid/unknown-token.txt: Module acme-extra uses unsupported capability token:acmeToken",
        );
        const duplicate = yield* buildError(
          withModule({ ...standaloneModule, id: "acme-workspace-readme" }),
        );
        assert.include(
          duplicate.message,
          "\n  test/fixtures/standalone/modules.ts, src/buildCatalog.test.ts: Duplicate module ID acme-workspace-readme",
        );
      }),
  );
});

describe("templates", () => {
  it("should resolve template paths with URL semantics when the base has or lacks a trailing slash", () => {
    const base = new URL("file:///catalog/templates/");
    assert.strictEqual(
      templates(base)("./app/main.ts").url,
      "file:///catalog/templates/app/main.ts",
    );
    // Without a trailing slash the base names a file, as in module resolution.
    assert.strictEqual(
      templates(new URL("file:///catalog/templates"))("./app/main.ts").url,
      "file:///catalog/app/main.ts",
    );
  });
});
