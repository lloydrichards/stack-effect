import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  buildCatalog,
  type CatalogInput,
  defineModules,
  defineTargets,
  type ModuleInput,
  templates,
} from "@repo/authoring";
import { CatalogDocument } from "@repo/domain/Catalog";
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

const buildFailure = (input: CatalogInput) =>
  Effect.flip(
    buildCatalog(input, { catalogId: "acme", root: packageRoot }),
  ).pipe(Effect.map((error) => error.issues));

describe("buildCatalog", () => {
  it.effect("builds the standalone fixture into the golden v1 document", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const first = yield* buildCatalog(catalog, { catalogId: "acme", root });
      const second = yield* buildCatalog(catalog, { catalogId: "acme", root });
      const golden = yield* fs.readFileString(
        yield* (yield* Path.Path).fromFileUrl(goldenUrl),
      );

      assert.strictEqual(first.json, golden);
      assert.strictEqual(second.json, first.json);
      const decoded = yield* Schema.decodeEffect(
        Schema.fromJsonString(CatalogDocument),
      )(first.json);
      assert.strictEqual(decoded.formatVersion, 1);
      assert.deepStrictEqual(
        decoded.modules.map((module) => module.id),
        ["acme-workspace-readme", "acme-app-greeting"],
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("embeds template bytes exactly, including a BOM", () =>
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
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("returns provenance without adding it to the document", () =>
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
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("names the definition and source of a missing reference", () =>
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
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("names the template that uses an unknown token", () =>
    Effect.gen(function* () {
      const issues = yield* buildFailure(
        withModule({
          ...standaloneModule,
          contributions: [
            {
              _tag: "file",
              path: "unknown.txt",
              contents: template("./invalid/unknown-token.txt"),
            },
          ],
        }),
      );
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
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("names only the templates that use an unknown token", () =>
    Effect.gen(function* () {
      const issues = yield* buildFailure(
        withModule({
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
        }),
      );
      assert.deepStrictEqual(
        issues.map((issue) => issue.template),
        ["test/fixtures/invalid/unknown-token.txt"],
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects contributed Finalize scripts unless allowed", () =>
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
            'Module acme-extra declares Finalize scripts, which contributed catalogs cannot ship; only an application-trusted build may pass finalizeScripts: "allow"',
          sources: ["src/buildCatalog.test.ts"],
        },
      ]);
      const allowed = yield* buildCatalog(input, {
        catalogId: "acme",
        root: packageRoot,
        finalizeScripts: "allow",
      });
      assert.strictEqual(allowed.document.modules.at(-1)?.scripts?.length, 1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reports every missing template before later stages run", () =>
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
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects fields outside the v1 definition shape", () =>
    Effect.gen(function* () {
      const withExtraField = { ...standaloneModule, extra: true };
      const issues = yield* buildFailure(withModule(withExtraField));
      assert.lengthOf(issues, 1);
      assert.strictEqual(issues[0]?.code, "invalid-shape");
      assert.deepStrictEqual(issues[0]?.subject, {
        _tag: "module",
        id: "acme-extra",
      });
      assert.deepStrictEqual(issues[0]?.sources, ["src/buildCatalog.test.ts"]);
      assert.include(issues[0]?.message, "extra");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects target fields outside the v1 definition shape", () =>
    Effect.gen(function* () {
      const acmeApp = acmeTargets.definitions[1];
      assert.isDefined(acmeApp);
      const target = { ...acmeApp, kind: "acme-extra-target", extra: true };
      const issues = yield* buildFailure({
        targets: [...catalog.targets, defineTargets(import.meta.url, [target])],
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
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reports malformed untyped definitions instead of crashing", () =>
    Effect.gen(function* () {
      const untyped = Schema.decodeEffect(Schema.fromJsonString(Schema.Any));
      const cases = [
        {
          definitions: [yield* untyped('{"title":"No id"}')],
          subject: "(unnamed module 1 in src/buildCatalog.test.ts)",
        },
        {
          definitions: [
            yield* untyped(
              '{"id":"acme-bare","title":"t","description":"d","supportedOn":[],"dependencies":[]}',
            ),
          ],
          subject: "acme-bare",
        },
        {
          definitions: [
            yield* untyped(
              '{"id":"acme-null","title":"t","description":"d","supportedOn":[],"dependencies":[],"contributions":[null]}',
            ),
          ],
          subject: "acme-null",
        },
        {
          definitions: [yield* untyped("null")],
          subject: "(unnamed module 1 in src/buildCatalog.test.ts)",
        },
        {
          definitions: yield* untyped("{}"),
          subject: "(unnamed module 1 in src/buildCatalog.test.ts)",
        },
      ];
      for (const { definitions, subject } of cases) {
        const issues = yield* buildFailure({
          targets: catalog.targets,
          modules: [defineModules(import.meta.url, definitions)],
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
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reports invalid locations as build issues", () =>
    Effect.gen(function* () {
      const badRoot = yield* Effect.flip(
        buildCatalog(catalog, { catalogId: "acme", root: "./relative/" }),
      );
      assert.deepStrictEqual(
        badRoot.issues.map(({ code, message }) => ({ code, message })),
        [
          {
            code: "invalid-options",
            message: "root ./relative/ is not a file URL or absolute path",
          },
        ],
      );
      const badSource = yield* buildFailure({
        targets: catalog.targets,
        modules: [
          { source: "hand-written.ts", definitions: [standaloneModule] },
        ],
      });
      assert.deepStrictEqual(
        badSource.map(({ code, message }) => ({ code, message })),
        [
          {
            code: "invalid-options",
            message:
              "Definition source hand-written.ts is not a file URL or absolute path",
          },
        ],
      );
      const outside = yield* buildFailure({
        targets: catalog.targets,
        modules: [defineModules("file:///elsewhere/a.ts", [standaloneModule])],
      });
      assert.strictEqual(outside[0]?.code, "invalid-options");
      assert.include(outside[0]?.message, "is outside the catalog root");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("accepts an absolute path as the catalog root", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fromPath = yield* buildCatalog(catalog, {
        catalogId: "acme",
        root: yield* path.fromFileUrl(root),
      });
      const fromUrl = yield* buildCatalog(catalog, { catalogId: "acme", root });
      assert.strictEqual(fromPath.json, fromUrl.json);
      assert.deepStrictEqual(fromPath.provenance, fromUrl.provenance);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects templates that are not readable UTF-8 files in root", () =>
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
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reports an unknown token both inline and in its template", () =>
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
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reports every shape error in a definition at once", () =>
    Effect.gen(function* () {
      const untyped = yield* Schema.decodeEffect(
        Schema.fromJsonString(Schema.Any),
      )(
        '{"id":"acme-shapes","title":1,"description":2,"supportedOn":[],"dependencies":[],"contributions":[],"junk":true}',
      );
      const issues = yield* buildFailure({
        targets: catalog.targets,
        modules: [defineModules(import.meta.url, [untyped])],
      });
      assert.lengthOf(issues, 1);
      for (const key of ["title", "description", "junk"])
        assert.include(issues[0]?.message, `["${key}"]`);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("records provenance for templated barrel exports", () =>
    Effect.gen(function* () {
      const { provenance } = yield* buildCatalog(
        withModule({
          ...standaloneModule,
          contributions: [
            {
              _tag: "barrel-export",
              barrelPath: "{{targetPath}}/src/index.ts",
              exportPath: template("./invalid/barrel-export.txt"),
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
          template: "test/fixtures/invalid/barrel-export.txt",
        },
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it("resolves template paths with URL semantics", () => {
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

  it.effect("formats issues with their location for authors", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        buildCatalog(withModule(standaloneModule), {
          catalogId: "",
          root: packageRoot,
        }),
      );
      assert.strictEqual(
        error.message,
        "Catalog build failed:\n  catalogId must be a non-empty string",
      );
      const duplicate = yield* Effect.flip(
        buildCatalog(
          withModule({ ...standaloneModule, id: "acme-workspace-readme" }),
          { catalogId: "acme", root: packageRoot },
        ),
      );
      assert.include(
        duplicate.message,
        "test/fixtures/standalone/modules.ts, src/buildCatalog.test.ts: Duplicate module ID acme-workspace-readme",
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
