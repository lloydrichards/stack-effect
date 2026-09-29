import { NodeServices } from "@effect/platform-node";
import { assert, describe, it, layer } from "@effect/vitest";
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

const issuesOf = (
  options: Parameters<typeof buildCatalog>[1],
  input: CatalogInput = extension,
) =>
  Effect.flip(buildCatalog(input, options)).pipe(
    Effect.map((error) => error.issues),
  );

layer(NodeServices.layer)("buildCatalog requires", (it) => {
  it.effect(
    "should publish only its own definitions when official references are checked",
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
      }),
  );

  it.effect(
    "should report the unresolved official references when official is not required",
    () =>
      Effect.gen(function* () {
        const issues = yield* issuesOf({ catalogId: "ext", root: packageRoot });

        assert.deepStrictEqual(
          issues.map(({ subject, code, message }) => ({
            subject,
            code,
            message,
          })),
          [
            {
              subject: { _tag: "module", id: "ext-auth" },
              code: "missing-reference",
              message: "Module ext-auth references missing target server",
            },
            {
              subject: { _tag: "module", id: "ext-auth" },
              code: "missing-reference",
              message: "Module ext-auth references missing target server",
            },
            {
              subject: { _tag: "module", id: "ext-auth" },
              code: "missing-reference",
              message: "Module ext-auth references missing module server-http",
            },
          ],
        );
      }),
  );

  it.effect.each([
    {
      condition: "official is required but not supplied",
      options: { catalogId: "ext", requires: ["official"] },
      message:
        'requires: ["official"] needs the official catalog document as `official`; load it with loadOfficialCatalog',
    },
    {
      condition: "the supplied document is not the official catalog",
      // It holds the referenced definitions, so only its identity is wrong.
      options: {
        catalogId: "ext",
        requires: ["official"],
        official: { ...official, catalogId: "acme" },
      },
      message:
        "official must be the official catalog (catalogId stack-effect-official), not acme",
    },
    {
      condition: "official is supplied but not required",
      options: { catalogId: "ext", official },
      message:
        'official is only used with requires: ["official"]; remove it or declare the dependency',
    },
    {
      condition: "the catalog requires its own official source",
      options: { catalogId: "official", requires: ["official"], official },
      message: "A catalog cannot require its own source",
    },
  ] satisfies ReadonlyArray<{
    readonly condition: string;
    readonly options: Omit<Parameters<typeof buildCatalog>[1], "root">;
    readonly message: string;
  }>)("should reject the options when $condition", ({ options, message }) =>
    Effect.gen(function* () {
      const issues = yield* issuesOf({ ...options, root: packageRoot });

      assert.deepStrictEqual(
        issues.map(({ code, message }) => ({ code, message })),
        [{ code: "invalid-options", message }],
      );
    }),
  );

  it.effect(
    "should reject the extension's own Finalize scripts when it requires official without allowing scripts",
    () =>
      Effect.gen(function* () {
        const issues = yield* issuesOf(
          {
            catalogId: "ext",
            root: packageRoot,
            requires: ["official"],
            official,
          },
          {
            targets: [],
            modules: [
              defineModules(import.meta.url, [
                {
                  ...extAuth,
                  scripts: [{ label: "Seed", command: "bun run seed" }],
                },
              ]),
            ],
          },
        );

        // The official module's own script is trusted and not reported.
        assert.deepStrictEqual(
          issues.map(({ subject, code }) => ({ subject, code })),
          [
            {
              subject: { _tag: "module", id: "ext-auth" },
              code: "finalize-script",
            },
          ],
        );
      }),
  );
});

const serving = (response: () => Response) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.succeed(HttpClientResponse.fromWeb(request, response())),
    ),
  );

const json = (body: string) =>
  new Response(body, { headers: { "content-type": "application/json" } });

describe("loadOfficialCatalog", () => {
  it.effect(
    "should decode the served document when the official catalog is available",
    () =>
      Effect.gen(function* () {
        const document = yield* loadOfficialCatalog(
          "https://official.test/v1.json",
        );

        assert.strictEqual(document.catalogId, "stack-effect-official");
      }).pipe(
        Effect.provide(
          serving(() =>
            json(
              Schema.encodeSync(Schema.fromJsonString(CatalogDocument))(
                official,
              ),
            ),
          ),
        ),
      ),
  );

  it.effect(
    "should name the URL when the official catalog responds with an error status",
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          loadOfficialCatalog("https://official.test/v1.json"),
        );

        assert.strictEqual(error._tag, "OfficialCatalogUnavailable");
        assert.include(error.message, "https://official.test/v1.json");
      }).pipe(Effect.provide(serving(() => new Response("", { status: 503 })))),
  );

  it.effect(
    "should fail as unavailable when the official catalog serves an invalid document",
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          loadOfficialCatalog("https://official.test/v1.json"),
        );

        assert.strictEqual(error._tag, "OfficialCatalogUnavailable");
        assert.strictEqual(error.url, "https://official.test/v1.json");
        assert.include(
          error.message,
          "Could not load the official catalog from https://official.test/v1.json: ",
        );
      }).pipe(
        Effect.provide(
          serving(() =>
            json('{"formatVersion":1,"catalogId":"stack-effect-official"}'),
          ),
        ),
      ),
  );
});
