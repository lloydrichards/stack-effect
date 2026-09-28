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
import { Effect, FileSystem, Schema } from "effect";
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
      const golden = yield* fs.readFileString(goldenUrl.pathname);

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
          message: "Fragment 0 module acme-extra contains Finalize scripts",
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
          subject: "(missing)",
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
        { definitions: [yield* untyped("null")], subject: "(missing)" },
        { definitions: yield* untyped("{}"), subject: "(missing)" },
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

  it.effect("reports invalid URLs as build issues", () =>
    Effect.gen(function* () {
      const badRoot = yield* Effect.flip(
        buildCatalog(catalog, { catalogId: "acme", root: "./relative/" }),
      );
      assert.deepStrictEqual(
        badRoot.issues.map(({ code, message }) => ({ code, message })),
        [
          {
            code: "invalid-options",
            message: "root ./relative/ is not a file URL",
          },
        ],
      );
      const issues = yield* buildFailure({
        targets: catalog.targets,
        modules: [
          ...catalog.modules,
          {
            source: "hand-written.ts",
            definitions: [
              {
                ...standaloneModule,
                contributions: [
                  {
                    _tag: "file",
                    path: "a.txt",
                    contents: { _tag: "TemplateRef", url: "relative.txt" },
                  },
                ],
              },
            ],
          },
        ],
      });
      assert.deepStrictEqual(issues, [
        {
          subject: { _tag: "module", id: "acme-extra" },
          code: "missing-template",
          message:
            "Module acme-extra contribution 0 contents template is not a URL",
          sources: ["hand-written.ts"],
          template: "relative.txt",
        },
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

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
