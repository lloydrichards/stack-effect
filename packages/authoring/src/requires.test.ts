import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  buildCatalog,
  type CatalogInput,
  defineModules,
  loadOfficialCatalog,
  type ModuleInput,
} from "@repo/authoring";
import { CatalogDocument, ModuleId, TargetKind } from "@repo/domain/Catalog";
import { Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

const packageRoot = new URL("../", import.meta.url);

/** A minimal official document; its module ships a script it may keep. */
const official: CatalogDocument = {
  formatVersion: 1,
  catalogId: "stack-effect-official",
  requiredCapabilities: [],
  targets: [
    {
      kind: TargetKind.make("server"),
      title: "Server",
      description: "An HTTP server",
      contributions: [],
    },
  ],
  modules: [
    {
      id: ModuleId.make("server-http"),
      title: "HTTP",
      description: "HTTP routing",
      supportedOn: [{ _tag: "kind", kind: TargetKind.make("server") }],
      dependencies: [],
      contributions: [],
      scripts: [{ label: "Install", command: "bun install" }],
    },
  ],
};

const extAuth: ModuleInput = {
  id: "ext-auth",
  title: "Auth",
  description: "Adds auth to the official server",
  supportedOn: [{ _tag: "kind", kind: "server" }],
  dependencies: [
    {
      _tag: "required-module",
      target: { kind: "server", name: "" },
      moduleId: "server-http",
    },
  ],
  contributions: [
    { _tag: "file", path: "{{targetPath}}/src/auth.ts", contents: "auth\n" },
  ],
};

const extension: CatalogInput = {
  targets: [],
  modules: [defineModules(import.meta.url, [extAuth])],
};

const issuesOf = (options: Parameters<typeof buildCatalog>[1]) =>
  Effect.flip(buildCatalog(extension, options)).pipe(
    Effect.map((error) =>
      error.issues.map(({ code, message }) => ({ code, message })),
    ),
  );

describe("buildCatalog requires", () => {
  it.effect(
    "checks official references without publishing official definitions",
    () =>
      Effect.gen(function* () {
        const { document } = yield* buildCatalog(extension, {
          catalogId: "ext",
          root: packageRoot,
          requires: ["official"],
          official,
        });

        assert.deepStrictEqual(document.requires, ["official"]);
        assert.deepStrictEqual(document.targets, []);
        assert.deepStrictEqual(
          document.modules.map((module) => module.id),
          ["ext-auth"],
        );
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reports an undeclared reference to an official definition", () =>
    Effect.gen(function* () {
      const issues = yield* issuesOf({ catalogId: "ext", root: packageRoot });

      assert.isTrue(issues.length > 0);
      assert.isTrue(
        issues.every((issue) =>
          ["missing-reference", "unsupported-target"].includes(issue.code),
        ),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("needs the official document when it is required", () =>
    Effect.gen(function* () {
      const issues = yield* issuesOf({
        catalogId: "ext",
        root: packageRoot,
        requires: ["official"],
      });

      assert.deepStrictEqual(
        issues.map((issue) => issue.code),
        ["invalid-options"],
      );
      assert.match(issues[0]?.message ?? "", /loadOfficialCatalog/u);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects a document that is not the official catalog", () =>
    Effect.gen(function* () {
      // It holds the referenced definitions, so only its identity is wrong.
      const issues = yield* issuesOf({
        catalogId: "ext",
        root: packageRoot,
        requires: ["official"],
        official: { ...official, catalogId: "acme" },
      });

      assert.deepStrictEqual(
        issues.map((issue) => issue.code),
        ["invalid-options"],
      );
      assert.match(issues[0]?.message ?? "", /stack-effect-official/u);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects an official document the catalog does not require", () =>
    Effect.gen(function* () {
      const issues = yield* issuesOf({
        catalogId: "ext",
        root: packageRoot,
        official,
      });

      assert.deepStrictEqual(
        issues.map((issue) => issue.code),
        ["invalid-options"],
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

const serving = (response: () => Response) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.succeed(HttpClientResponse.fromWeb(request, response())),
    ),
  );

describe("loadOfficialCatalog", () => {
  it.effect("decodes the served official document", () =>
    Effect.gen(function* () {
      const document = yield* loadOfficialCatalog(
        "https://official.test/v1.json",
      );

      assert.strictEqual(document.catalogId, "stack-effect-official");
    }).pipe(
      Effect.provide(
        serving(
          () =>
            new Response(
              Schema.encodeSync(Schema.fromJsonString(CatalogDocument))(
                official,
              ),
              { headers: { "content-type": "application/json" } },
            ),
        ),
      ),
    ),
  );

  it.effect("names the URL when the official catalog is unavailable", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        loadOfficialCatalog("https://official.test/v1.json"),
      );

      assert.strictEqual(error._tag, "OfficialCatalogUnavailable");
      assert.include(error.message, "https://official.test/v1.json");
    }).pipe(Effect.provide(serving(() => new Response("", { status: 503 })))),
  );
});
